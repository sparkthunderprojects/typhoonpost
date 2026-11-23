import { randomBytes, xchacha20poly1305 } from './noble.ts';
import { concat, fromBase64, fromUtf8, toBase64, utf8 } from './bytes.ts';
import { open, seal } from './seal.ts';

/**
 * Encryption for the things a person keeps for themselves: contacts, calendar events, tasks and
 * attachment files. Same design as the message envelope (a random content key per record, sealed
 * to the owner's public key), with the record's kind bound in as associated data so a ciphertext
 * stored as a contact cannot be passed off as a task, and the other way round.
 */
export type RecordKind = 'contact' | 'event' | 'task' | 'doc' | 'docmeta';

export const RECORD_VERSION = 1;
const NONCE_LEN = 24;
const recordAad = (kind: RecordKind) => utf8(`typhoonpost/record/v1/${kind}`);
const FILE_AAD = utf8('typhoonpost/file/v1');

export interface EncryptedRecord {
  version: number;
  payload: string;
  key: string;
}

export function encryptRecord<T>(kind: RecordKind, value: T, ownerPublicKey: Uint8Array): EncryptedRecord {
  const contentKey = randomBytes(32);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(contentKey, nonce, recordAad(kind)).encrypt(utf8(JSON.stringify(value)));
  const sealed = seal(contentKey, ownerPublicKey);
  contentKey.fill(0);
  return { version: RECORD_VERSION, payload: toBase64(concat(nonce, ct)), key: toBase64(sealed) };
}

export function decryptRecord<T>(kind: RecordKind, enc: EncryptedRecord, ownerPrivateKey: Uint8Array): T {
  if (enc.version !== RECORD_VERSION) throw new Error(`Unsupported record format ${enc.version}.`);
  const contentKey = open(fromBase64(enc.key), ownerPrivateKey);
  try {
    const raw = fromBase64(enc.payload);
    const plain = xchacha20poly1305(contentKey, raw.slice(0, NONCE_LEN), recordAad(kind)).decrypt(raw.slice(NONCE_LEN));
    return JSON.parse(fromUtf8(plain)) as T;
  } finally {
    contentKey.fill(0);
  }
}

/**
 * Attachment files. Each file gets its own random key. The key travels inside the encrypted
 * message payload; the storage bucket only ever holds the ciphertext.
 */
export function encryptFile(plain: Uint8Array): { blob: Uint8Array; key: Uint8Array } {
  const key = randomBytes(32);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(key, nonce, FILE_AAD).encrypt(plain);
  return { blob: concat(nonce, ct), key };
}

export function decryptFile(blob: Uint8Array, key: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, blob.slice(0, NONCE_LEN), FILE_AAD).decrypt(blob.slice(NONCE_LEN));
}
