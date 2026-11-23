import { describe, expect, it } from 'vitest';
import { randomBytes } from '@noble/hashes/utils.js';
// The real edge-function code, run against an in-memory database.
import { handleDeliver, type DeliverDb } from '../../../../supabase/functions/deliver-local/handler';
import { decryptMessage, encryptMessage, type MessagePayload } from '../envelope';
import { openAttestation } from '../attest';
import { fromBase64, toBase64 } from '../bytes';
import { publicKeyOf } from '../keys';

const alice = { sk: randomBytes(32), address: 'alice@typhoonpost.com' };
const bob = { sk: randomBytes(32), address: 'bob@typhoonpost.com', userId: 'bob-id' };
const carol = { sk: randomBytes(32), address: 'carol@typhoonpost.com', userId: 'carol-id' };
const pk = (sk: Uint8Array) => publicKeyOf(sk);

type Row = Record<string, string | number | boolean>;

function server() {
  const rows: Row[] = [];
  const people = [bob, carol];
  const db: DeliverDb = {
    findRecipient: async (a) => {
      const p = people.find((x) => x.address === a);
      return p ? { user_id: p.userId, public_key: toBase64(pk(p.sk)) } : null;
    },
    countDeliveriesSince: async () => 0,
    insertEmail: async (r) => void rows.push(r as Row),
    logDelivery: async () => {},
  };
  const send = (to: typeof bob, payload: MessagePayload) => {
    const enc = encryptMessage(payload, pk(to.sk));
    return handleDeliver(
      new Request('http://x/', {
        method: 'POST',
        body: JSON.stringify({ deliveries: [{ address: to.address, version: enc.version, payload: enc.payload, key: enc.key, size: 10 }] }),
      }),
      { userId: 'alice-id', address: alice.address },
      db,
    );
  };
  return { rows, send };
}

const msg = (over: Partial<MessagePayload> = {}): MessagePayload => ({
  sender: 'Alice',
  senderEmail: alice.address,
  avatarColor: '#0F6CBD',
  subject: 'Lunch? SECRET-SUBJECT',
  preview: 'p',
  body: '<p>SECRET-BODY</p>',
  category: 'primary',
  to: [bob.address],
  cc: [],
  attachments: [],
  ...over,
});

describe('local delivery, end to end', () => {
  it('alice to bob: bob reads it, the database does not', async () => {
    const { rows, send } = server();
    expect((await send(bob, msg())).status).toBe(200);
    const row = rows[0];
    expect(JSON.stringify(row)).not.toMatch(/SECRET|alice|Lunch/i);
    const m = decryptMessage({ version: row.enc_version as number, payload: row.enc_payload as string, key: row.enc_key as string }, bob.sk);
    expect(m.subject).toContain('SECRET-SUBJECT');
    expect(openAttestation(row.enc_attest as string, row.enc_payload as string, bob.sk).from).toBe(alice.address);
  });

  it('a sender cannot pass off a message as someone else', async () => {
    const { rows, send } = server();
    await send(bob, msg({ senderEmail: 'ceo@typhoonpost.com', sender: 'The CEO' }));
    const row = rows[0];
    const m = decryptMessage({ version: 1, payload: row.enc_payload as string, key: row.enc_key as string }, bob.sk);
    expect(m.senderEmail).toBe('ceo@typhoonpost.com'); // what Alice typed
    // What the app shows comes from the attestation the server issued from Alice's sign-in.
    expect(openAttestation(row.enc_attest as string, row.enc_payload as string, bob.sk).from).toBe(alice.address);
  });

  it('only the intended recipient can open it', async () => {
    const { rows, send } = server();
    await send(bob, msg());
    const row = rows[0];
    expect(() => decryptMessage({ version: 1, payload: row.enc_payload as string, key: row.enc_key as string }, carol.sk)).toThrow();
    expect(() => openAttestation(row.enc_attest as string, row.enc_payload as string, carol.sk)).toThrow();
  });

  it('a message swapped onto another delivery fails verification', async () => {
    const { rows, send } = server();
    await send(bob, msg({ subject: 'first' }));
    await send(bob, msg({ subject: 'second' }));
    // Someone moves the first message's ciphertext under the second one's attestation.
    expect(() => openAttestation(rows[1].enc_attest as string, rows[0].enc_payload as string, bob.sk)).toThrow(/does not match/);
  });

  it('a tampered attestation or payload is rejected', async () => {
    const { rows, send } = server();
    await send(bob, msg());
    const raw = fromBase64(rows[0].enc_attest as string);
    raw[raw.length - 1] ^= 1;
    expect(() => openAttestation(toBase64(raw), rows[0].enc_payload as string, bob.sk)).toThrow();
    const payload = fromBase64(rows[0].enc_payload as string);
    payload[5] ^= 1;
    expect(() => openAttestation(rows[0].enc_attest as string, toBase64(payload), bob.sk)).toThrow(/does not match/);
  });
});
