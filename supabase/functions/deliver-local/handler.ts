// Delivers messages that the sender's browser has already encrypted to another Typhoonpost user.
// The function never sees message content. It only checks who is sending, applies a daily limit,
// attaches a sealed proof of the sender's address, and stores the ciphertext in the recipient's inbox.
import { sealAttestation } from './crypto/attest.ts';
import { fromBase64 } from './crypto/bytes.ts';

export interface Caller {
  userId: string;
  /** The sender's own Typhoonpost address, from the server's records. */
  address: string;
}

export interface Recipient {
  user_id: string;
  public_key: string | null;
}

export interface DeliverDb {
  findRecipient(address: string): Promise<Recipient | null>;
  countDeliveriesSince(userId: string, sinceIso: string): Promise<number>;
  insertEmail(row: Record<string, unknown>): Promise<void>;
  logDelivery(userId: string): Promise<void>;
  /** Copies one stored (encrypted) attachment object from one path to another. */
  copyFile(fromPath: string, toPath: string): Promise<void>;
}

export interface Delivery {
  address: string;
  version: number;
  payload: string;
  key: string;
  size: number;
  /** Ids of encrypted attachment files in the sender's folder to copy into the recipient's. */
  files?: string[];
}

export interface DeliveryResult {
  address: string;
  ok: boolean;
  error?: 'unknown_recipient' | 'no_keys' | 'invalid' | 'limit' | 'attachment_failed';
}

export const DAILY_DELIVERY_LIMIT = 300;
const MAX_DELIVERIES = 50;
const MAX_FIELD_CHARS = 2_000_000;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const MAX_FILES = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function valid(d: unknown): d is Delivery {
  if (!d || typeof d !== 'object') return false;
  const x = d as Record<string, unknown>;
  return (
    typeof x.address === 'string' &&
    EMAIL_RE.test(x.address) &&
    x.version === 1 &&
    typeof x.payload === 'string' &&
    typeof x.key === 'string' &&
    x.payload.length > 0 &&
    x.key.length > 0 &&
    x.payload.length <= MAX_FIELD_CHARS &&
    x.key.length <= 4096 &&
    B64_RE.test(x.payload) &&
    B64_RE.test(x.key) &&
    Number.isInteger(x.size) &&
    (x.size as number) >= 0 &&
    (x.files === undefined ||
      (Array.isArray(x.files) && x.files.length <= MAX_FILES && x.files.every((f) => typeof f === 'string' && UUID_RE.test(f))))
  );
}

export async function handleDeliver(req: Request, caller: Caller | null, db: DeliverDb): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!caller) return json({ error: 'Not signed in' }, 401);

  let body: { deliveries?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const list = body.deliveries;
  if (!Array.isArray(list) || list.length === 0) return json({ error: 'Nothing to deliver' }, 400);
  if (list.length > MAX_DELIVERIES) return json({ error: `Too many recipients (max ${MAX_DELIVERIES})` }, 400);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let used = await db.countDeliveriesSince(caller.userId, since);

  const results: DeliveryResult[] = [];
  for (const raw of list) {
    if (!valid(raw)) {
      results.push({ address: String((raw as { address?: unknown })?.address ?? ''), ok: false, error: 'invalid' });
      continue;
    }
    const address = raw.address.trim().toLowerCase();
    if (used >= DAILY_DELIVERY_LIMIT) {
      results.push({ address, ok: false, error: 'limit' });
      continue;
    }
    const recipient = await db.findRecipient(address);
    if (!recipient) {
      results.push({ address, ok: false, error: 'unknown_recipient' });
      continue;
    }
    if (!recipient.public_key) {
      results.push({ address, ok: false, error: 'no_keys' });
      continue;
    }
    // Copy the encrypted files first. The same ids are used in the recipient's folder, so the
    // message (which holds the ids and keys) needs no change. Only the sender's own folder can
    // be a source.
    try {
      for (const id of raw.files ?? []) await db.copyFile(`${caller.userId}/${id}`, `${recipient.user_id}/${id}`);
    } catch {
      results.push({ address, ok: false, error: 'attachment_failed' });
      continue;
    }
    const attest = sealAttestation(caller.address, raw.payload, fromBase64(recipient.public_key));
    await db.insertEmail({
      user_id: recipient.user_id,
      folder: 'inbox',
      read: false,
      size_bytes: raw.size,
      enc_version: raw.version,
      enc_payload: raw.payload,
      enc_key: raw.key,
      enc_attest: attest,
    });
    await db.logDelivery(caller.userId);
    used++;
    results.push({ address, ok: true });
  }
  return json({ results });
}
