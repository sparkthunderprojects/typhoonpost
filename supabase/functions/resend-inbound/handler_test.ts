// Run with: deno test --allow-net=none supabase/functions/resend-inbound/handler_test.ts
import nodeAssert from 'node:assert/strict';

const assert = (cond: unknown, msg?: string) => nodeAssert.ok(cond, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertNotEquals = (a: unknown, b: unknown) => nodeAssert.notDeepEqual(a, b);
import { handleInbound, type InboundDb, type MailboxRecipient } from './handler.ts';
import { decryptMessage } from './crypto/envelope.ts';
import { toBase64 } from './crypto/bytes.ts';
import { x25519 } from './crypto/noble.ts';

const SECRET_BYTES = crypto.getRandomValues(new Uint8Array(24));
const WHSEC = 'whsec_' + toBase64(SECRET_BYTES);

async function signed(body: string, opts: { ts?: number } = {}) {
  const id = 'msg_1';
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', SECRET_BYTES, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  return new Request('http://x/', {
    method: 'POST',
    body,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + toBase64(new Uint8Array(mac)) },
  });
}

const EVENT = JSON.stringify({
  type: 'email.received',
  data: { email_id: 'em_123', from: 'Ada <ada@example.org>', to: ['jane@typhoonpost.com'], subject: 'Quarterly numbers' },
});

const FULL = {
  from: 'Ada Lovelace <ada@example.org>',
  to: ['jane@typhoonpost.com'],
  cc: [],
  subject: 'Quarterly numbers',
  html: '<p>SECRET-BODY-TEXT</p>',
  text: 'SECRET-BODY-TEXT',
  headers: { 'List-Unsubscribe': '<mailto:x@y>' },
  attachments: [{ filename: 'q3-budget.xlsx', content_type: 'application/vnd.ms-excel', size: 24576 }],
};
const fakeFetch = (() => Promise.resolve(new Response(JSON.stringify(FULL)))) as unknown as typeof fetch;

function setup(recipients: MailboxRecipient[]) {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const db: InboundDb = {
    findRecipients: () => Promise.resolve(recipients),
    insertEmail: (row) => {
      const k = `${row.user_id}/${row.external_id}`;
      if (seen.has(k)) return Promise.resolve(false);
      seen.add(k);
      rows.push(row);
      return Promise.resolve(true);
    },
  };
  return { rows, db };
}

const sk = x25519.utils.randomSecretKey();
const pk = toBase64(x25519.getPublicKey(sk));
const env = { webhookSecret: WHSEC, apiKey: 're_test' };

Deno.test('encrypts to the recipient and stores no readable content', async () => {
  const { rows, db } = setup([{ user_id: 'u1', address: 'jane@typhoonpost.com', public_key: pk }]);
  const res = await handleInbound(await signed(EVENT), env, db, fakeFetch);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).delivered, 1);
  assertEquals(rows.length, 1);
  const stored = JSON.stringify(rows[0]);
  for (const secret of ['SECRET-BODY-TEXT', 'Quarterly', 'ada@example.org', 'Ada', 'q3-budget', 'jane@typhoonpost.com']) {
    assert(!stored.includes(secret), `stored row leaks ${secret}`);
  }
  const msg = decryptMessage(
    { version: rows[0].enc_version as number, payload: rows[0].enc_payload as string, key: rows[0].enc_key as string },
    sk,
  );
  assertEquals(msg.subject, 'Quarterly numbers');
  assertEquals(msg.senderEmail, 'ada@example.org');
  assertEquals(msg.sender, 'Ada Lovelace');
  assertEquals(msg.category, 'promotions');
  assertEquals(msg.attachments[0].name, 'q3-budget.xlsx');
  assertEquals(msg.attachments[0].kind, 'sheet');
  assert(msg.body.includes('SECRET-BODY-TEXT'));
  assertEquals(rows[0].folder, 'inbox');
  assert((rows[0].size_bytes as number) > 0);
});

Deno.test('a retried webhook does not store the message twice', async () => {
  const { rows, db } = setup([{ user_id: 'u1', address: 'jane@typhoonpost.com', public_key: pk }]);
  await handleInbound(await signed(EVENT), env, db, fakeFetch);
  const again = await handleInbound(await signed(EVENT), env, db, fakeFetch);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).delivered, 0);
  assertEquals(rows.length, 1);
});

Deno.test('two recipients each get their own ciphertext they alone can open', async () => {
  const sk2 = x25519.utils.randomSecretKey();
  const { rows, db } = setup([
    { user_id: 'u1', address: 'jane@typhoonpost.com', public_key: pk },
    { user_id: 'u2', address: 'sam@typhoonpost.com', public_key: toBase64(x25519.getPublicKey(sk2)) },
  ]);
  await handleInbound(await signed(EVENT), env, db, fakeFetch);
  assertEquals(rows.length, 2);
  assertNotEquals(rows[0].enc_payload, rows[1].enc_payload);
  const open = (r: Record<string, unknown>, k: Uint8Array) =>
    decryptMessage({ version: r.enc_version as number, payload: r.enc_payload as string, key: r.enc_key as string }, k);
  assertEquals(open(rows[0], sk).subject, 'Quarterly numbers');
  assertEquals(open(rows[1], sk2).subject, 'Quarterly numbers');
  let failed = false;
  try { open(rows[0], sk2); } catch { failed = true; }
  assert(failed, 'recipient 2 must not open recipient 1 message');
});

Deno.test('an account with no keys yet stores nothing readable and asks Resend to retry', async () => {
  const { rows, db } = setup([{ user_id: 'u1', address: 'jane@typhoonpost.com', public_key: null }]);
  const res = await handleInbound(await signed(EVENT), env, db, fakeFetch);
  assertEquals(res.status, 503);
  assertEquals(rows.length, 0);
});

Deno.test('rejects bad signatures, stale timestamps and missing config', async () => {
  const { rows, db } = setup([{ user_id: 'u1', address: 'jane@typhoonpost.com', public_key: pk }]);
  const bad = new Request('http://x/', { method: 'POST', body: EVENT, headers: { 'svix-id': 'm', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' } });
  assertEquals((await handleInbound(bad, env, db, fakeFetch)).status, 401);
  assertEquals((await handleInbound(await signed(EVENT, { ts: 1000 }), env, db, fakeFetch)).status, 401);
  assertEquals((await handleInbound(await signed(EVENT), {}, db, fakeFetch)).status, 503);
  assertEquals(rows.length, 0);
});

Deno.test('ignores other event types and unknown recipients', async () => {
  const { rows, db } = setup([]);
  const other = JSON.stringify({ type: 'email.sent', data: {} });
  assertEquals((await (await handleInbound(await signed(other), env, db, fakeFetch)).json()).ignored, 'email.sent');
  assertEquals((await (await handleInbound(await signed(EVENT), env, db, fakeFetch)).json()).ignored, 'no matching mailbox');
  assertEquals(rows.length, 0);
});
