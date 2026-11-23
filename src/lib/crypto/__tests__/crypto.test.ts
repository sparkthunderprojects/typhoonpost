import { describe, expect, it } from 'vitest';
import { fromBase32, toBase32, fromBase64, toBase64 } from '../bytes';
import { deriveAccountKeys, saltForEmail } from '../kdf';
import {
  createAccountKeys,
  publicKeyOf,
  rewrapForNewPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
  WrongKeyError,
} from '../keys';
import { open, seal } from '../seal';
import { randomBytes } from '@noble/hashes/utils.js';

const EMAIL = 'Jane@Example.com';

describe('encoding', () => {
  it('base32 round-trips and matches RFC 4648 vectors', () => {
    expect(toBase32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    for (const n of [1, 5, 31, 32, 33]) {
      const b = randomBytes(n);
      expect(fromBase32(toBase32(b))).toEqual(b);
    }
  });
  it('base64 round-trips large buffers', () => {
    const b = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    expect(fromBase64(toBase64(b))).toEqual(b);
  });
  it('rejects invalid base32', () => {
    expect(() => fromBase32('AB1!')).toThrow();
  });
});

describe('key derivation', () => {
  it('is deterministic, case-insensitive on email, and separates auth from wrap keys', async () => {
    const a = await deriveAccountKeys('correct horse', EMAIL);
    const b = await deriveAccountKeys('correct horse', EMAIL.toLowerCase());
    expect(a.authSecret).toBe(b.authSecret);
    expect(a.wrapKey).toEqual(b.wrapKey);
    expect(a.authSecret).not.toContain(toBase64(a.wrapKey));
  }, 60_000);
  it('changes with password and with email', async () => {
    const a = await deriveAccountKeys('correct horse', EMAIL);
    const b = await deriveAccountKeys('correct horsf', EMAIL);
    const c = await deriveAccountKeys('correct horse', 'other@example.com');
    expect(a.authSecret).not.toBe(b.authSecret);
    expect(a.authSecret).not.toBe(c.authSecret);
  }, 60_000);
  it('uses a fixed-length salt', () => {
    expect(saltForEmail(EMAIL)).toHaveLength(16);
  });
});

describe('account keys', () => {
  it('unlocks with the password and with the recovery key to the same private key', async () => {
    const k = await createAccountKeys('s3cret passphrase', EMAIL);
    const viaPw = await unlockWithPassword(k.stored, 's3cret passphrase', EMAIL);
    const viaRc = unlockWithRecoveryKey(k.stored, k.recoveryKey);
    expect(viaPw).toEqual(k.privateKey);
    expect(viaRc).toEqual(k.privateKey);
    expect(toBase64(publicKeyOf(viaPw))).toBe(k.stored.publicKey);
  }, 60_000);

  it('fails closed with a wrong password or recovery key', async () => {
    const k = await createAccountKeys('s3cret passphrase', EMAIL);
    await expect(unlockWithPassword(k.stored, 'wrong', EMAIL)).rejects.toBeInstanceOf(WrongKeyError);
    const other = await createAccountKeys('another', 'x@example.com');
    expect(() => unlockWithRecoveryKey(k.stored, other.recoveryKey)).toThrow(WrongKeyError);
    expect(() => unlockWithRecoveryKey(k.stored, 'not-a-key')).toThrow(WrongKeyError);
  }, 60_000);

  it('fails closed when the stored blob is tampered with', async () => {
    const k = await createAccountKeys('s3cret passphrase', EMAIL);
    const raw = fromBase64(k.stored.wrappedByPassword);
    raw[raw.length - 1] ^= 1;
    const bad = { ...k.stored, wrappedByPassword: toBase64(raw) };
    await expect(unlockWithPassword(bad, 's3cret passphrase', EMAIL)).rejects.toBeInstanceOf(WrongKeyError);
  }, 60_000);

  it('does not let the password wrap and the recovery wrap be swapped', async () => {
    const k = await createAccountKeys('s3cret passphrase', EMAIL);
    const swapped = { ...k.stored, wrappedByPassword: k.stored.wrappedByRecovery };
    await expect(unlockWithPassword(swapped, 's3cret passphrase', EMAIL)).rejects.toBeInstanceOf(WrongKeyError);
  }, 60_000);

  it('password change keeps the same private key and switches the sign-in secret', async () => {
    const k = await createAccountKeys('old password', EMAIL);
    const next = await rewrapForNewPassword(k.stored, k.privateKey, 'new password', EMAIL);
    expect(next.authSecret).not.toBe(k.authSecret);
    expect(await unlockWithPassword(next.stored, 'new password', EMAIL)).toEqual(k.privateKey);
    await expect(unlockWithPassword(next.stored, 'old password', EMAIL)).rejects.toBeInstanceOf(WrongKeyError);
    // The recovery wrap is untouched and still works.
    expect(unlockWithRecoveryKey(next.stored, k.recoveryKey)).toEqual(k.privateKey);
  }, 120_000);

  it('formats the recovery key as grouped text that parses back', async () => {
    const k = await createAccountKeys('pw pw pw', EMAIL);
    expect(k.recoveryKey).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
    expect(unlockWithRecoveryKey(k.stored, k.recoveryKey.toLowerCase().replace(/-/g, ' '))).toEqual(k.privateKey);
  }, 60_000);
});

describe('sealed box', () => {
  it('opens with the right key only', () => {
    const sk = randomBytes(32);
    const pk = publicKeyOf(sk);
    const msg = new TextEncoder().encode('Subject: hello');
    const sealed = seal(msg, pk);
    expect(open(sealed, sk)).toEqual(msg);
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });
  it('produces different ciphertext each time and detects tampering', () => {
    const sk = randomBytes(32);
    const pk = publicKeyOf(sk);
    const msg = randomBytes(1000);
    const a = seal(msg, pk);
    const b = seal(msg, pk);
    expect(a).not.toEqual(b);
    a[a.length - 1] ^= 1;
    expect(() => open(a, sk)).toThrow();
  });
  it('does not contain the plaintext', () => {
    const sk = randomBytes(32);
    const marker = new TextEncoder().encode('SECRET-MARKER-12345');
    const sealed = seal(marker, publicKeyOf(sk));
    expect(Buffer.from(sealed).includes(Buffer.from('SECRET-MARKER'))).toBe(false);
  });
});
