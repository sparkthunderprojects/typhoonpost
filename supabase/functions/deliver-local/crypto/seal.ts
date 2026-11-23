import { hkdf, randomBytes, sha256, x25519, xchacha20poly1305 } from './noble.ts';
import { concat, utf8 } from './bytes.ts';

/**
 * Anonymous public-key encryption ("sealed box"). Anyone with the recipient's public key can
 * produce one, only the holder of the private key can open it. This is what lets the inbound
 * function encrypt a message for a user without ever being able to read it afterwards.
 */
const VERSION = 1;
const NONCE_LEN = 24;

function sealKey(shared: Uint8Array, ephPublic: Uint8Array, recipientPublic: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concat(ephPublic, recipientPublic), utf8('typhoonpost/seal/v1'), 32);
}

export function seal(plain: Uint8Array, recipientPublic: Uint8Array): Uint8Array {
  const ephSecret = x25519.utils.randomSecretKey();
  const ephPublic = x25519.getPublicKey(ephSecret);
  const key = sealKey(x25519.getSharedSecret(ephSecret, recipientPublic), ephPublic, recipientPublic);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce, ephPublic).encrypt(plain);
  ephSecret.fill(0);
  return concat(Uint8Array.of(VERSION), ephPublic, nonce, ct);
}

export function open(sealed: Uint8Array, recipientSecret: Uint8Array): Uint8Array {
  if (sealed[0] !== VERSION) throw new Error('Unsupported sealed-box version.');
  const ephPublic = sealed.slice(1, 33);
  const nonce = sealed.slice(33, 33 + NONCE_LEN);
  const ct = sealed.slice(33 + NONCE_LEN);
  const recipientPublic = x25519.getPublicKey(recipientSecret);
  const key = sealKey(x25519.getSharedSecret(recipientSecret, ephPublic), ephPublic, recipientPublic);
  return xchacha20poly1305(key, nonce, ephPublic).decrypt(ct);
}
