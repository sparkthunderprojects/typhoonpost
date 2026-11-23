// Run with: deno test --allow-net --allow-read supabase/functions/deliver-local/handler_test.ts
import nodeAssert from 'node:assert/strict';
import { DAILY_DELIVERY_LIMIT, handleDeliver, type DeliverDb } from './handler.ts';
import { openAttestation } from './crypto/attest.ts';
import { toBase64 } from './crypto/bytes.ts';
import { x25519 } from './crypto/noble.ts';

const eq = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const ok = (c: unknown, m?: string) => nodeAssert.ok(c, m);

const bobSk = x25519.utils.randomSecretKey();
const bobPk = toBase64(x25519.getPublicKey(bobSk));
const caller = { userId: 'alice-id', address: 'alice@typhoonpost.com' };
const PAYLOAD = toBase64(crypto.getRandomValues(new Uint8Array(200)));
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(90)));

function setup(opts: { used?: number; bobKey?: string | null; copyFails?: boolean } = {}) {
  const copies: [string, string][] = [];
  const rows: Record<string, unknown>[] = [];
  const log: string[] = [];
  const db: DeliverDb = {
    findRecipient: (a) =>
      Promise.resolve(
        a === 'bob@typhoonpost.com'
          ? { user_id: 'bob-id', public_key: opts.bobKey === undefined ? bobPk : opts.bobKey }
          : null,
      ),
    countDeliveriesSince: () => Promise.resolve(opts.used ?? 0),
    insertEmail: (r) => (rows.push(r), Promise.resolve()),
    logDelivery: (u) => (log.push(u), Promise.resolve()),
    copyFile: (f, t) => (opts.copyFails ? Promise.reject(new Error('x')) : (copies.push([f, t]), Promise.resolve())),
  };
  return { rows, log, db, copies };
}
const req = (body: unknown) => new Request('http://x/', { method: 'POST', body: JSON.stringify(body) });
const delivery = (over: Record<string, unknown> = {}) => ({ address: 'bob@typhoonpost.com', version: 1, payload: PAYLOAD, key: KEY, size: 500, ...over });

Deno.test('stores ciphertext for the recipient with a sealed sender proof and no readable sender', async () => {
  const { rows, log, db } = setup();
  const res = await handleDeliver(req({ deliveries: [delivery()] }), caller, db);
  eq(res.status, 200);
  eq((await res.json()).results, [{ address: 'bob@typhoonpost.com', ok: true }]);
  eq(rows.length, 1);
  eq(rows[0].user_id, 'bob-id');
  eq(rows[0].folder, 'inbox');
  eq(rows[0].enc_payload, PAYLOAD);
  eq(rows[0].read, false);
  ok(!JSON.stringify(rows[0]).includes('alice'), 'sender must not be readable in the stored row');
  eq(log, ['alice-id']);
  const a = openAttestation(rows[0].enc_attest as string, PAYLOAD, bobSk);
  eq(a.from, 'alice@typhoonpost.com');
});

Deno.test('the sender proof is bound to the ciphertext it was issued for', async () => {
  const { rows, db } = setup();
  await handleDeliver(req({ deliveries: [delivery()] }), caller, db);
  let failed = false;
  try { openAttestation(rows[0].enc_attest as string, toBase64(new Uint8Array(200)), bobSk); } catch { failed = true; }
  ok(failed, 'attestation must not verify against a different payload');
});

Deno.test('requires a signed-in caller', async () => {
  const { rows, db } = setup();
  eq((await handleDeliver(req({ deliveries: [delivery()] }), null, db)).status, 401);
  eq(rows.length, 0);
});

Deno.test('reports unknown recipients and recipients without keys, storing nothing', async () => {
  const a = setup();
  const r1 = await (await handleDeliver(req({ deliveries: [delivery({ address: 'nobody@typhoonpost.com' })] }), caller, a.db)).json();
  eq(r1.results[0], { address: 'nobody@typhoonpost.com', ok: false, error: 'unknown_recipient' });
  const b = setup({ bobKey: null });
  const r2 = await (await handleDeliver(req({ deliveries: [delivery()] }), caller, b.db)).json();
  eq(r2.results[0].error, 'no_keys');
  eq(a.rows.length + b.rows.length, 0);
});

Deno.test('enforces the daily delivery limit', async () => {
  const { rows, db } = setup({ used: DAILY_DELIVERY_LIMIT });
  const r = await (await handleDeliver(req({ deliveries: [delivery()] }), caller, db)).json();
  eq(r.results[0].error, 'limit');
  eq(rows.length, 0);
});

Deno.test('rejects malformed deliveries', async () => {
  const { rows, db } = setup();
  const bad = [
    delivery({ version: 2 }),
    delivery({ payload: 'not base64!!' }),
    delivery({ key: '' }),
    delivery({ size: -1 }),
    delivery({ address: 'bob' }),
    'string',
  ];
  const r = await (await handleDeliver(req({ deliveries: bad }), caller, db)).json();
  ok(r.results.every((x: { ok: boolean }) => !x.ok));
  eq(rows.length, 0);
  eq((await handleDeliver(req({ deliveries: [] }), caller, db)).status, 400);
  eq((await handleDeliver(req({}), caller, db)).status, 400);
  eq((await handleDeliver(req({ deliveries: new Array(51).fill(delivery()) }), caller, db)).status, 400);
  eq((await handleDeliver(new Request('http://x/', { method: 'POST', body: '{nope' }), caller, db)).status, 400);
});

Deno.test('handles several recipients independently', async () => {
  const { rows, db } = setup();
  const r = await (await handleDeliver(req({ deliveries: [delivery(), delivery({ address: 'ghost@typhoonpost.com' })] }), caller, db)).json();
  eq(r.results.map((x: { ok: boolean }) => x.ok), [true, false]);
  eq(rows.length, 1);
});

const FID = '3f0a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

Deno.test('copies attached files from the sender folder to the recipient folder under the same id', async () => {
  const { rows, copies, db } = setup();
  const res = await handleDeliver(req({ deliveries: [delivery({ files: [FID] })] }), caller, db);
  eq((await res.json()).results, [{ address: 'bob@typhoonpost.com', ok: true }]);
  eq(copies, [[`alice-id/${FID}`, `bob-id/${FID}`]]);
  eq(rows.length, 1);
});

Deno.test('a file id cannot point outside the sender folder', async () => {
  const { rows, copies, db } = setup();
  const res = await handleDeliver(req({ deliveries: [delivery({ files: ['../victim-id/' + FID] })] }), caller, db);
  eq((await res.json()).results[0].error, 'invalid');
  eq(copies.length, 0);
  eq(rows.length, 0);
});

Deno.test('a failed file copy delivers nothing', async () => {
  const { rows, log, db } = setup({ copyFails: true });
  const res = await handleDeliver(req({ deliveries: [delivery({ files: [FID] })] }), caller, db);
  eq((await res.json()).results, [{ address: 'bob@typhoonpost.com', ok: false, error: 'attachment_failed' }]);
  eq(rows.length, 0);
  eq(log.length, 0);
});
