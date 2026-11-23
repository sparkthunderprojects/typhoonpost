import { randomBytes, xchacha20poly1305 } from './noble.ts';
import { concat, fromBase64, fromUtf8, toBase64, utf8 } from './bytes.ts';
import { open, seal } from './seal.ts';

/**
 * Message envelope, version 1.
 *
 * Everything that describes a message's content is packed into one JSON payload and encrypted
 * with a fresh random content key. That key is then sealed to the recipient's public key.
 * Keeping the two apart means a future key rotation only re-seals 32 bytes per message instead
 * of re-encrypting every body.
 */
export const ENVELOPE_VERSION = 1;
const NONCE_LEN = 24;
const AAD = utf8('typhoonpost/envelope/v1');

export interface PayloadAttachment {
  name: string;
  size: string;
  kind: 'image' | 'doc' | 'pdf' | 'slide' | 'sheet';
  /** Set when the file is stored: bucket object id, base64 per-file key, type and byte length. */
  file?: { id: string; key: string; mime: string; bytes: number };
}

/** Everything the server must not be able to read. */
export interface MessagePayload {
  sender: string;
  senderEmail: string;
  avatarColor: string;
  subject: string;
  preview: string;
  /** HTML body. */
  body: string;
  category: 'primary' | 'promotions';
  to: string[];
  cc: string[];
  /** Only ever present on the sender's own copy (Sent Items, drafts). Never in a recipient's copy. */
  bcc?: string[];
  importance?: 'high' | 'low';
  /** A meeting invitation, reply or cancellation. Same encrypted payload as the message itself. */
  invite?: unknown;
  attachments: PayloadAttachment[];
}

export interface EncryptedMessage {
  version: number;
  /** base64: nonce followed by ciphertext. */
  payload: string;
  /** base64: the content key sealed to the recipient. */
  key: string;
}

export function encryptMessage(message: MessagePayload, recipientPublicKey: Uint8Array): EncryptedMessage {
  const contentKey = randomBytes(32);
  const nonce = randomBytes(NONCE_LEN);
  const ct = xchacha20poly1305(contentKey, nonce, AAD).encrypt(utf8(JSON.stringify(message)));
  const sealed = seal(contentKey, recipientPublicKey);
  contentKey.fill(0);
  return { version: ENVELOPE_VERSION, payload: toBase64(concat(nonce, ct)), key: toBase64(sealed) };
}

export function decryptMessage(enc: EncryptedMessage, recipientPrivateKey: Uint8Array): MessagePayload {
  if (enc.version !== ENVELOPE_VERSION) throw new Error(`Unsupported message format ${enc.version}.`);
  const contentKey = open(fromBase64(enc.key), recipientPrivateKey);
  try {
    const raw = fromBase64(enc.payload);
    const plain = xchacha20poly1305(contentKey, raw.slice(0, NONCE_LEN), AAD).decrypt(raw.slice(NONCE_LEN));
    return JSON.parse(fromUtf8(plain)) as MessagePayload;
  } finally {
    contentKey.fill(0);
  }
}
