import { supabase } from '@/lib/supabase';

const cache = new Map<string, Promise<string>>();

/**
 * Fetch a remote image through the Typhoonpost proxy so the sender sees our server, not the
 * reader's IP address or browser. Resolves to an object URL. Fails closed: if the proxy cannot
 * fetch the image, nothing is loaded directly.
 */
export function loadImageViaProxy(remoteUrl: string): Promise<string> {
  const hit = cache.get(remoteUrl);
  if (hit) return hit;
  const p = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not signed in');
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${base}/functions/v1/image-proxy?url=${encodeURIComponent(remoteUrl)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`Image unavailable (${res.status})`);
    return URL.createObjectURL(await res.blob());
  })();
  p.catch(() => cache.delete(remoteUrl));
  cache.set(remoteUrl, p);
  return p;
}
