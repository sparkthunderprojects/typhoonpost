import { sha256 } from './noble.ts';
import { fromBase64, fromUtf8, toBase64, toHex, utf8 } from './bytes.ts';
import { open, seal } from './seal.ts';

/**
 * Proof of who sent a message between two Typhoonpost users.
 *
 * The sender encrypts the message to the recipient, so nothing inside it can be trusted to say
 * who wrote it. The delivery function therefore adds an attestation: the sender's address as the
 * server knows it from their sign-in, tied to this exact ciphertext by its hash, and sealed to
 * the recipient so the database holds no readable sender. The recipient's browser opens it and
 * shows that address instead of anything the sender typed.
 */
export interface Attestation {
  from: string;
  payloadSha256: string;
  at: string;
}

export const payloadHash = (encPayload: string): string => toHex(sha256(fromBase64(encPayload)));

export function sealAttestation(from: string, encPayload: string, recipientPublicKey: Uint8Array): string {
  const a: Attestation = { from, payloadSha256: payloadHash(encPayload), at: new Date().toISOString() };
  return toBase64(seal(utf8(JSON.stringify(a)), recipientPublicKey));
}

/** Throws if the attestation cannot be opened or does not belong to this ciphertext. */
export function openAttestation(sealed: string, encPayload: string, recipientPrivateKey: Uint8Array): Attestation {
  const a = JSON.parse(fromUtf8(open(fromBase64(sealed), recipientPrivateKey))) as Attestation;
  if (typeof a.from !== 'string' || a.payloadSha256 !== payloadHash(encPayload)) {
    throw new Error('The sender attestation does not match this message.');
  }
  return a;
}
