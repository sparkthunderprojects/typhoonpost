// Sends an email through Resend on behalf of the signed-in user.
// Secrets required: RESEND_API_KEY
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const MAX_RECIPIENTS = 50;
const MAX_HTML_CHARS = 1_000_000;
const DAILY_SEND_LIMIT = 300;

function toList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
  return raw.map((s) => String(s).trim()).filter(Boolean);
}

function stripTags(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'Email sending is not configured yet' }, 503);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const to = toList(payload.to);
  const cc = toList(payload.cc);
  const bcc = toList(payload.bcc);
  const subject = String(payload.subject ?? '').replace(/[\r\n]+/g, ' ').slice(0, 998);
  const html = typeof payload.html === 'string' ? payload.html : '';
  const text = typeof payload.text === 'string' && payload.text ? payload.text : stripTags(html);

  if (to.length === 0) return json({ error: 'Add at least one recipient' }, 400);
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    return json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` }, 400);
  }
  const bad = [...to, ...cc, ...bcc].find((a) => !EMAIL_RE.test(a));
  if (bad) return json({ error: `"${bad}" is not a valid email address` }, 400);
  if (!html && !text) return json({ error: 'The message is empty' }, 400);
  if (html.length > MAX_HTML_CHARS) return json({ error: 'The message is too large' }, 413);

  // The sender address is always the user's own Typhoonpost mailbox: it can't be spoofed from the client.
  const { data: mailbox } = await supabase.from('mailboxes').select('address').eq('user_id', user.id).maybeSingle();
  if (!mailbox?.address) return json({ error: 'You do not have a Typhoonpost address yet' }, 409);

  // Simple abuse guard: cap messages sent per rolling 24 hours.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('folder', 'sent')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_SEND_LIMIT) return json({ error: 'Daily sending limit reached' }, 429);

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const name = String(profile?.display_name ?? '').replace(/[<>",\r\n]/g, '').trim();
  const from = name ? `${name} <${mailbox.address}>` : mailbox.address;

  const body: Record<string, unknown> = {
    from,
    to,
    subject,
    html: html || undefined,
    text,
    reply_to: mailbox.address,
  };
  if (cc.length) body.cc = cc;
  if (bcc.length) body.bcc = bcc;
  if (typeof payload.inReplyTo === 'string' && payload.inReplyTo) {
    body.headers = { 'In-Reply-To': payload.inReplyTo.slice(0, 998) };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: result?.message ?? 'The email provider rejected the message' }, res.status === 429 ? 429 : 502);
  }
  return json({ id: result.id, from: mailbox.address });
});
