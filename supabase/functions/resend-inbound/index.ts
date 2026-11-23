// Webhook receiver for Resend "email.received" events.
// Secrets required: RESEND_API_KEY, RESEND_WEBHOOK_SECRET (whsec_...)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---- Svix-style signature verification (used by Resend webhooks) ----
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(secret: string, id: string, timestamp: string, signatures: string, body: string) {
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

function kindFor(contentType: string, filename: string): 'image' | 'doc' | 'pdf' | 'slide' | 'sheet' {
  const t = (contentType || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf' || f.endsWith('.pdf')) return 'pdf';
  if (/\.(xlsx?|csv)$/.test(f) || t.includes('spreadsheet') || t.includes('excel')) return 'sheet';
  if (/\.(pptx?|key)$/.test(f) || t.includes('presentation') || t.includes('powerpoint')) return 'slide';
  return 'doc';
}

// Newsletters / bulk mail go to "Other"; everything else is "Focused".
function categoryFor(headers: Record<string, unknown> | undefined): 'primary' | 'promotions' {
  if (!headers) return 'primary';
  const keys = Object.keys(headers).map((k) => k.toLowerCase());
  if (keys.includes('list-unsubscribe') || keys.includes('list-id')) return 'promotions';
  const precedence = String(
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'precedence')?.[1] ?? '',
  ).toLowerCase();
  return precedence === 'bulk' || precedence === 'list' ? 'promotions' : 'primary';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  // 503 makes Resend retry later, so mail sent before setup finishes is not lost.
  if (!secret || !apiKey) return json({ error: 'Not configured' }, 503);

  const raw = await req.text();
  const ok = await verifySignature(
    secret,
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

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: boxes, error: boxErr } = await supabase
    .from('mailboxes')
    .select('user_id, address')
    .in('address', recipients);
  if (boxErr) return json({ error: boxErr.message }, 500);
  if (!boxes || boxes.length === 0) return json({ ignored: 'no matching mailbox' });

  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
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
  const category = categoryFor(full.headers);
  const attachments = (Array.isArray(full.attachments) ? full.attachments : []).filter(
    (a: { content_disposition?: string }) => a.content_disposition !== 'inline',
  );

  let delivered = 0;
  for (const box of boxes) {
    const { data: inserted, error } = await supabase
      .from('emails')
      .upsert(
        {
          user_id: box.user_id,
          external_id: d.email_id,
          sender: senderName,
          sender_email: from.email,
          avatar_color: colorFor(from.email || senderName),
          subject: String(full.subject ?? d.subject ?? '') || '(No subject)',
          preview,
          body: html,
          folder: 'inbox',
          category,
          read: false,
          to_addresses: (full.to ?? d.to ?? []).map(String),
          cc_addresses: (full.cc ?? d.cc ?? []).map(String),
        },
        { onConflict: 'user_id,external_id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) return json({ error: error.message }, 500);

    // Only a freshly inserted row is returned; a retried webhook inserts nothing twice.
    const row = inserted?.[0];
    if (row) {
      delivered++;
      if (attachments.length) {
        await supabase.from('attachments').insert(
          attachments.map((a: { filename?: string; content_type?: string; size?: number }) => ({
            email_id: row.id,
            name: a.filename || 'attachment',
            size: humanSize(Number(a.size ?? 0)),
            kind: kindFor(a.content_type ?? '', a.filename ?? ''),
          })),
        );
      }
    }
  }
  return json({ delivered });
});
