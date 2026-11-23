import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64, utf8 } from './bytes.ts';

/**
 * Argon2id parameters. Memory is in KiB. These are stored alongside the account's keys so they
 * can be raised later; sign-in always starts from KDF_V1 because the browser has to derive the
 * sign-in secret before it can read anything from the server.
 */
export const KDF_V1 = { t: 3, m: 65536, p: 1, dkLen: 64 } as const;

export interface AccountKeys {
  /** Sent to the auth server in place of the password. Reveals nothing about the real password. */
  authSecret: string;
  /** Unwraps the private key. Never leaves the browser. */
  wrapKey: Uint8Array;
}

/**
 * The salt comes from the email address so the browser can derive the same keys at sign-in
 * without asking the server first. Emails are unique per account, which is the property a salt
 * needs here.
 */
export function saltForEmail(email: string): Uint8Array {
  return sha256(utf8(`typhoonpost/salt/v1:${email.trim().toLowerCase()}`)).slice(0, 16);
}

export async function deriveAccountKeys(password: string, email: string): Promise<AccountKeys> {
  const stretched = await argon2idAsync(utf8(password.normalize('NFKC')), saltForEmail(email), {
    ...KDF_V1,
    asyncTick: 10,
  });
  const authSecret = toBase64(hkdf(sha256, stretched, undefined, utf8('typhoonpost/auth/v1'), 32));
  const wrapKey = hkdf(sha256, stretched, undefined, utf8('typhoonpost/wrap/v1'), 32);
  stretched.fill(0);
  return { authSecret, wrapKey };
}
