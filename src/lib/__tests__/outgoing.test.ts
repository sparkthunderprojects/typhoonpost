import { beforeEach, describe, expect, it, vi } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { decryptMessage } from '../crypto/envelope';

const sent: Record<string, unknown>[] = [];
const deliveries: { address: string; version: number; payload: string; key: string }[] = [];
const resend: Record<string, unknown>[] = [];
const keys = new Map<string, Uint8Array>();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Ann' } }) }) }) }) },
}));
vi.mock('@/lib/db', () => ({
  insertEmail: async (_u: string, e: Record<string, unknown>) => {
    sent.push(e);
    return { id: 's1', ...e };
  },
  lookupPublicKeys: async (addrs: string[]) => new Map(addrs.filter((a) => keys.has(a)).map((a) => [a, keys.get(a)!])),
  deliverLocal: async (d: typeof deliveries) => {
    deliveries.push(...d);
    return d.map((x) => ({ address: x.address, ok: true }));
  },
  sendViaResend: async (p: Record<string, unknown>) => {
    resend.push(p);
    return { id: 'r', from: 'x' };
  },
}));

import { sendMessage } from '../outgoing';

const priv = new Map<string, Uint8Array>();
for (const a of ['bob@typhoonpost.com', 'carol@typhoonpost.com', 'dan@typhoonpost.com']) {
  const sk = x25519.utils.randomSecretKey();
  priv.set(a, sk);
  keys.set(a, x25519.getPublicKey(sk));
}
const open = (address: string) => {
  const d = deliveries.find((x) => x.address === address)!;
  return decryptMessage({ version: d.version, payload: d.payload, key: d.key }, priv.get(address)!);
};

beforeEach(() => {
  sent.length = 0;
  deliveries.length = 0;
  resend.length = 0;
});

describe('sendMessage with Cc and Bcc', () => {
  it('shows To and Cc to everyone and never reveals Bcc', async () => {
    const out = await sendMessage({
      userId: 'u', myAddress: 'me@typhoonpost.com', to: 'bob@typhoonpost.com', cc: 'carol@typhoonpost.com',
      bcc: 'dan@typhoonpost.com', importance: 'high', subject: 'Hi', body: '<p>x</p>',
    });
    expect(out.delivered.sort()).toEqual(['bob@typhoonpost.com', 'carol@typhoonpost.com', 'dan@typhoonpost.com']);
    for (const a of ['bob@typhoonpost.com', 'carol@typhoonpost.com', 'dan@typhoonpost.com']) {
      const m = open(a);
      expect(m.to).toEqual(['bob@typhoonpost.com']);
      expect(m.cc).toEqual(['carol@typhoonpost.com']);
      expect(m.bcc).toBeUndefined();
      expect(m.importance).toBe('high');
      expect(JSON.stringify(m)).not.toContain('dan@typhoonpost.com');
    }
    expect(sent[0].toAddresses).toEqual(['bob@typhoonpost.com']);
    expect(sent[0].ccAddresses).toEqual(['carol@typhoonpost.com']);
    expect(sent[0].bccAddresses).toEqual(['dan@typhoonpost.com']);
    expect(sent[0].importance).toBe('high');
  });

  it('sends outside addresses one message for To and Cc, and one each for Bcc', async () => {
    await sendMessage({
      userId: 'u', myAddress: 'me@typhoonpost.com', to: 'a@out.org', cc: 'b@out.org', bcc: 'c@out.org, d@out.org',
      subject: 'Hi', body: '<p>x</p>',
    });
    expect(resend).toEqual([
      { to: 'a@out.org', cc: 'b@out.org', subject: 'Hi', html: '<p>x</p>' },
      { to: 'c@out.org', subject: 'Hi', html: '<p>x</p>' },
      { to: 'd@out.org', subject: 'Hi', html: '<p>x</p>' },
    ]);
  });

  it('puts Cc-only outside recipients in To, as the mail provider requires', async () => {
    await sendMessage({ userId: 'u', myAddress: 'me@typhoonpost.com', to: 'bob@typhoonpost.com', cc: 'b@out.org', subject: 'Hi', body: '<p>x</p>' });
    expect(resend).toEqual([{ to: 'b@out.org', subject: 'Hi', html: '<p>x</p>' }]);
  });

  it('keeps normal importance out of the message', async () => {
    await sendMessage({ userId: 'u', myAddress: 'me@typhoonpost.com', to: 'bob@typhoonpost.com', subject: 'Hi', body: '<p>x</p>' });
    expect(open('bob@typhoonpost.com').importance).toBeUndefined();
  });
});
