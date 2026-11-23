// Fetches a remote image on behalf of a signed-in user so the image's sender never sees the
// reader's IP address, browser or cookies. Verified-JWT only; fails closed.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const IMAGE_TYPE = /^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)(;|$)/i;

const fail = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Reject anything that is not an ordinary public web address. */
export function urlAllowed(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.includes(':') || host.startsWith('[')) return false; // bare names and IPv6 literals
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|arpa)$/.test(host)) return false;
  if (/^[\d.]+$/.test(host)) return !isPrivateIPv4(host);
  return true;
}

async function resolvesToPublicAddress(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host)) return true;
  try {
    const v4 = await Deno.resolveDns(host, 'A');
    if (v4.some(isPrivateIPv4)) return false;
    const v6 = await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]);
    if (v6.some((ip) => /^(::1?$|f[cd]|fe[89ab]|::ffff)/i.test(ip))) return false;
  } catch {
    // DNS API unavailable or the name has no record; the fetch below will simply fail.
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return fail(405, 'Method not allowed');

  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return fail(400, 'Invalid image address');
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response | null = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!urlAllowed(current) || !(await resolvesToPublicAddress(current.hostname))) {
        return fail(403, 'That address cannot be loaded');
      }
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        credentials: 'omit',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TyphoonpostImageProxy)', Accept: 'image/*' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel();
        if (!loc) return fail(502, 'Bad redirect');
        current = new URL(loc, current);
        res = null;
        continue;
      }
      break;
    }
  } catch {
    return fail(502, 'Could not load the image');
  }

  if (!res) return fail(502, 'Too many redirects');
  if (!res.ok || !res.body) return fail(502, 'The image is unavailable');
  const type = res.headers.get('content-type') ?? '';
  if (!IMAGE_TYPE.test(type)) {
    await res.body.cancel();
    return fail(415, 'Not a supported image');
  }
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    await res.body.cancel();
    return fail(413, 'Image too large');
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return fail(413, 'Image too large');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }

  return new Response(body, {
    headers: {
      ...cors,
      'Content-Type': type.split(';')[0],
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});
