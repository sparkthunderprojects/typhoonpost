import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { concat, fromBase32, fromBase64, toBase32, toBase64, utf8 } from './bytes';
import { deriveAccountKeys } from './kdf';

const VERSION = 1;
const NONCE_LEN = 24;

/** What the server stores for an account. Everything here is safe for the server to hold. */
export interface StoredKeys {
  publicKey: string;
  wrappedByPassword: string;
  wrappedByRecovery: string;
  version: number;
}

export interface NewAccountKeys {
  /** Sign-in secret to register with the auth server. */
  authSecret: string;
  stored: StoredKeys;
  /** Shown to the person once. Never sent anywhere. */
  recoveryKey: string;
  privateKey: Uint8Array;
}

function wrap(plain: Uint8Array, key: Uint8Array, label: string): string {
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce, utf8(label)).encrypt(plain);
  return toBase64(concat(Uint8Array.of(VERSION), nonce, ct));
}

function unwrap(blob: string, key: Uint8Array, label: string): Uint8Array {
  const raw = fromBase64(blob);
  if (raw[0] !== VERSION) throw new Error('This account uses a key format this version cannot read.');
  const nonce = raw.slice(1, 1 + NONCE_LEN);
  const ct = raw.slice(1 + NONCE_LEN);
  return xchacha20poly1305(key, nonce, utf8(label)).decrypt(ct);
}

const PW_LABEL = 'typhoonpost/privkey/password/v1';
const RC_LABEL = 'typhoonpost/privkey/recovery/v1';

const recoveryWrapKey = (recovery: Uint8Array) => hkdf(sha256, recovery, undefined, utf8('typhoonpost/recovery/v1'), 32);

export function formatRecoveryKey(bytes: Uint8Array): string {
  return (toBase32(bytes).match(/.{1,4}/g) ?? []).join('-');
}

export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

/** Creates everything a new account needs. Runs entirely in the browser. */
export async function createAccountKeys(password: string, email: string): Promise<NewAccountKeys> {
  const { authSecret, wrapKey } = await deriveAccountKeys(password, email);
  return newKeyBundle(authSecret, wrapKey);
}

/** Same, when the password has already been stretched (avoids a second slow derivation). */
export function newKeyBundle(authSecret: string, wrapKey: Uint8Array): NewAccountKeys {
  const privateKey = x25519.utils.randomSecretKey();
  const recovery = randomBytes(32);
  return {
    authSecret,
    privateKey,
    recoveryKey: formatRecoveryKey(recovery),
    stored: {
      publicKey: toBase64(publicKeyOf(privateKey)),
      wrappedByPassword: wrap(privateKey, wrapKey, PW_LABEL),
      wrappedByRecovery: wrap(privateKey, recoveryWrapKey(recovery), RC_LABEL),
      version: VERSION,
    },
  };
}

export class WrongKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongKeyError';
  }
}

export function unlockWithWrapKey(stored: StoredKeys, wrapKey: Uint8Array): Uint8Array {
  try {
    return unwrap(stored.wrappedByPassword, wrapKey, PW_LABEL);
  } catch (e) {
    if (e instanceof Error && e.message.includes('key format')) throw e;
    throw new WrongKeyError('That password does not unlock this mailbox.');
  }
}

export async function unlockWithPassword(stored: StoredKeys, password: string, email: string): Promise<Uint8Array> {
  const { wrapKey } = await deriveAccountKeys(password, email);
  return unlockWithWrapKey(stored, wrapKey);
}

export function unlockWithRecoveryKey(stored: StoredKeys, recoveryKey: string): Uint8Array {
  let recovery: Uint8Array;
  try {
    recovery = fromBase32(recoveryKey);
  } catch (e) {
    throw new WrongKeyError(e instanceof Error ? e.message : 'That recovery key is not valid.');
  }
  if (recovery.length !== 32) throw new WrongKeyError('That recovery key is not the right length.');
  try {
    return unwrap(stored.wrappedByRecovery, recoveryWrapKey(recovery), RC_LABEL);
  } catch {
    throw new WrongKeyError('That recovery key does not unlock this mailbox.');
  }
}

/**
 * Re-protects an already unlocked private key under a new password. Used for password changes
 * and for resetting a password with the recovery key. Mail itself is not touched.
 */
export async function rewrapForNewPassword(
  stored: StoredKeys,
  privateKey: Uint8Array,
  newPassword: string,
  email: string,
): Promise<{ authSecret: string; stored: StoredKeys }> {
  const { authSecret, wrapKey } = await deriveAccountKeys(newPassword, email);
  return { authSecret, stored: { ...stored, wrappedByPassword: wrap(privateKey, wrapKey, PW_LABEL) } };
}
