import { fromBase64, toBase64 } from './bytes';

/**
 * Holds the unlocked private key for this browser tab. It lives in memory and is mirrored to
 * sessionStorage so a page refresh does not force a password prompt; closing the tab clears it.
 * That mirror is readable by any script running on the page, which is why the app serves no
 * third-party scripts and sanitises all message HTML.
 */
const SESSION_KEY = 'typhoonpost:session-key';
let current: Uint8Array | null = null;

export function setPrivateKey(key: Uint8Array): void {
  current = key;
  try {
    sessionStorage.setItem(SESSION_KEY, toBase64(key));
  } catch {
    /* storage unavailable: the key still works until the page is reloaded */
  }
}

export function getPrivateKey(): Uint8Array | null {
  if (current) return current;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      current = fromBase64(stored);
      return current;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPrivateKey(): void {
  current?.fill(0);
  current = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
