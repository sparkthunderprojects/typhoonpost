// Inbound mail handler. Kept free of Deno- and Supabase-specific code so it can be tested.
//
// Every message is encrypted to the recipient's public key before it is stored. The server
// therefore never holds the readable subject, sender, recipients, body or attachment names of
// stored mail. (Resend, which receives the mail from the sender, does see it in transit.)
import { encryptMessage, type MessagePayload, type PayloadAttachment } from './crypto/envelope.ts';
import { fromBase64 } from './crypto/bytes.ts';

export interface MailboxRecipient {
  user_id: string;
  address: string;
  /** base64 X25519 public key, or null if the account has not created keys yet. */
  public_key: string | null;
}

export interface InboundDb {
  findRecipients(addresses: string[]): Promise<MailboxRecipient[]>;
  /** Inserts the row. Returns false when it already existed (a retried webhook). */
  insertEmail(row: Record<string, unknown>): Promise<boolean>;
}

export interface InboundEnv {
  webhookSecret: string;
  apiKey: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---- Svix-style signature verification (used by Resend webhooks) ----
function b64decode(s: string) {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(secret: string, id: string, timestamp: string, signatures: string, body: string) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    b64decode(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signatures.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && !!sig && safeEqual(sig, expected);
  });
}

// ---- Helpers ----
function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: raw.trim().toLowerCase() };
}

const COLORS = ['#0F6CBD', '#0EA5E9', '#14B8A6', '#16A34A', '#F59E0B', '#EC4899', '#8B5CF6', '#DC2626'];
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function humanSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindFor(contentType: string, filename: string): PayloadAttachment['kind'] {
  const t = (contentType || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf' || f.endsWith('.pdf')) return 'pdf';
  if (/\.(xlsx?|csv)$/.test(f) || t.includes('spreadsheet') || t.includes('excel')) return 'sheet';
  if (/\.(pptx?|key)$/.test(f) || t.includes('presentation') || t.includes('powerpoint')) return 'slide';
  return 'doc';
}

// Newsletters / bulk mail go to "Other"; everything else is "Focused". Decided here, while the
// headers are readable, and stored inside the encrypted payload.
function categoryFor(headers: Record<string, unknown> | undefined): 'primary' | 'promotions' {
  if (!headers) return 'primary';
  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  if (keys.includes('list-unsubscribe') || keys.includes('list-id')) return 'promotions';
  const precedence = String(
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'precedence')?.[1] ?? '',
  ).toLowerCase();
  return precedence === 'bulk' || precedence === 'list' ? 'promotions' : 'primary';
}

export async function handleInbound(
  req: Request,
  env: Partial<InboundEnv>,
  db: InboundDb,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 503 makes Resend retry later, so mail sent before setup finishes is not lost.
  if (!env.webhookSecret || !env.apiKey) return json({ error: 'Not configured' }, 503);

  const raw = await req.text();
  const ok = await verifySignature(
    env.webhookSecret,
    req.headers.get('svix-id') ?? '',
    req.headers.get('svix-timestamp') ?? '',
    req.headers.get('svix-signature') ?? '',
    raw,
  ).catch(() => false);
  if (!ok) return json({ error: 'Invalid signature' }, 401);

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (event.type !== 'email.received' || !event.data) return json({ ignored: event.type ?? 'unknown' });

  const d = event.data as {
    email_id: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    received_for?: string[];
    subject?: string;
  };

  const recipients = [...new Set([...(d.to ?? []), ...(d.cc ?? []), ...(d.bcc ?? []), ...(d.received_for ?? [])]
    .map((r) => parseAddress(String(r)).email)
    .filter(Boolean))];

  const boxes = await db.findRecipients(recipients);
  if (boxes.length === 0) return json({ ignored: 'no matching mailbox' });

  const res = await fetchFn(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, {
    headers: { Authorization: `Bearer ${env.apiKey}` },
  });
  if (!res.ok) return json({ error: `Could not fetch message (${res.status})` }, 502);
  const full = await res.json();

  const from = parseAddress(String(full.from ?? d.from ?? ''));
  const senderName = from.name || from.email.split('@')[0] || 'Unknown';
  const text: string = typeof full.text === 'string' ? full.text : '';
  const html: string =
    typeof full.html === 'string' && full.html.trim()
      ? full.html
      : `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
  const preview = (text || html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  const attachments = (Array.isArray(full.attachments) ? full.attachments : []).filter(
    (a: { content_disposition?: string }) => a.content_disposition !== 'inline',
  );

  const payload: MessagePayload = {
    sender: senderName,
    senderEmail: from.email,
    avatarColor: colorFor(from.email || senderName),
    subject: String(full.subject ?? d.subject ?? '') || '(No subject)',
    preview,
    body: html,
    category: categoryFor(full.headers),
    to: (full.to ?? d.to ?? []).map(String),
    cc: (full.cc ?? d.cc ?? []).map(String),
    attachments: attachments.map((a: { filename?: string; content_type?: string; size?: number }) => ({
      name: a.filename || 'attachment',
      size: humanSize(Number(a.size ?? 0)),
      kind: kindFor(a.content_type ?? '', a.filename ?? ''),
    })),
  };
  const sizeBytes =
    new TextEncoder().encode(html).length + attachments.reduce((n: number, a: { size?: number }) => n + Number(a.size ?? 0), 0);

  let delivered = 0;
  let waiting = 0;
  for (const box of boxes) {
    // No key yet (account created before encryption and not signed in since): nothing is
    // stored in readable form. Answering 503 below makes Resend retry later.
    if (!box.public_key) {
      waiting++;
      continue;
    }
    const enc = encryptMessage(payload, fromBase64(box.public_key));
    const fresh = await db.insertEmail({
      user_id: box.user_id,
      external_id: d.email_id,
      folder: 'inbox',
      read: false,
      size_bytes: sizeBytes,
      enc_version: enc.version,
      enc_payload: enc.payload,
      enc_key: enc.key,
    });
    if (fresh) delivered++;
  }
  if (waiting > 0) return json({ delivered, waiting_for_keys: waiting }, 503);
  return json({ delivered });
}
