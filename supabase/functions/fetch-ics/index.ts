// Fetches a public iCalendar feed for a signed-in user so the browser can show it.
// The server only ever sees the feed's public address and its public contents. Nothing from the
// user's own calendar passes through here. Guarded against being pointed at private networks.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_BYTES = 2_000_000;
const MAX_HOPS = 3;
const TIMEOUT_MS = 8000;

function privateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function privateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb') || s.startsWith('ff');
}

async function checkHost(url: URL): Promise<string | null> {
  if (url.protocol !== 'https:') return 'Only https addresses are allowed';
  if (url.username || url.password) return 'Addresses with a login are not allowed';
  if (url.port && url.port !== '443') return 'Only the standard secure port is allowed';
  const host = url.hostname;
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') {
    return 'That address is not allowed';
  }
  let found = 0;
  for (const type of ['A', 'AAAA'] as const) {
    try {
      const ips = await Deno.resolveDns(host, type);
      for (const ip of ips) {
        found++;
        if (type === 'A' ? privateV4(ip) : privateV6(ip)) return 'That address is not allowed';
      }
    } catch {
      /* no records of this type */
    }
  }
  return found ? null : 'That address could not be found';
}

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: 'Not signed in' }, 401);

  let raw = '';
  try {
    raw = String((await req.json()).url ?? '').trim();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (!raw || raw.length > 2048) return json({ error: 'Enter the calendar address' }, 400);
  raw = raw.replace(/^webcal:\/\//i, 'https://');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: 'That is not a valid address' }, 400);
  }

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const problem = await checkHost(url);
    if (problem) return json({ error: problem }, 400);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'Typhoonpost-Calendar/1.0' },
      });
    } catch {
      return json({ error: 'The calendar did not respond in time' }, 502);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc || hop === MAX_HOPS) return json({ error: 'Too many redirects' }, 502);
      try {
        url = new URL(loc, url);
      } catch {
        return json({ error: 'Bad redirect' }, 502);
      }
      continue;
    }
    if (!res.ok) return json({ error: `The calendar returned an error (${res.status})` }, 502);
    const text = await readCapped(res);
    if (text === null) return json({ error: 'That calendar is too large (limit 2 MB)' }, 413);
    if (!/BEGIN:VCALENDAR/i.test(text)) return json({ error: 'That address is not a calendar feed' }, 422);
    return json({ ics: text });
  }
  return json({ error: 'Too many redirects' }, 502);
});
