# Zero-access encryption: Stage 0 spec

Status: Stage 1 (key infrastructure) is built and tested. Stages 2 to 5 are not started.

## 1. The claim

Stored mail, contacts and events are ciphertext. Keys are created in the user's browser and never reach the server unwrapped. Typhoonpost staff, Supabase and anyone holding a database copy cannot read stored content.

### Not claimed

- **External mail is plaintext in transit.** Mail to and from other providers passes through Resend. The inbound function sees a message briefly, encrypts it, and discards the plaintext. This is "encrypted at rest", not end-to-end. Only mail between two Typhoonpost users is end-to-end.
- **Browser-delivered code must be trusted.** A compromised server could ship malicious JavaScript. Mitigations: strict CSP, no third-party scripts, pinned dependencies, open-source client. Not eliminated.
- **Metadata that stays readable:** timestamps, folder, read and flag state, size, and the account a message belongs to.

The public website must not use the words "zero-access" until Stage 4 ships, and must repeat these limits when it does.

## 2. Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Losing both password and recovery key means the mail is unrecoverable. No server-side reset. | Confirmed by owner |
| 2 | Subject, sender, recipients, snippet, body, attachments (including file names) are encrypted. Timestamps, folder, flags, size stay readable. | Assumed, awaiting confirmation |
| 3 | Stages 1 to 3 ship before any real user is invited. | Assumed, awaiting confirmation |

## 3. Primitives

Audited, pure-TypeScript libraries only (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`, plus an Argon2id implementation). They run in the browser and in Deno edge functions, which the inbound function needs. No custom cryptography.

- Password hardening: Argon2id, 64 MiB memory, 3 passes, 1 lane, salt derived from the account email. The browser has to derive the sign-in secret before it can read anything from the server, so a stored random salt would need an unauthenticated lookup that reveals which emails have accounts. Argon2id takes about one second in a desktop browser; it still needs timing on a mid-range phone.
- Key agreement: X25519.
- Symmetric encryption: XChaCha20-Poly1305 with a random 24-byte nonce.
- Key derivation: HKDF-SHA-256.

## 3a. Key hierarchy

1. `stretched = Argon2id(password, salt)`, 64 bytes.
2. `authSecret = HKDF(stretched, "typhoonpost/auth")`. Sent to Supabase Auth as the account password. The server never sees the real password.
3. `wrapKey = HKDF(stretched, "typhoonpost/wrap")`. Never leaves the browser.
4. At sign-up the browser generates an X25519 keypair and a 256-bit recovery key.
5. The private key is stored twice, each wrapped with XChaCha20-Poly1305: once under `wrapKey`, once under the recovery key.
6. The recovery key is shown once as grouped base32 text, with a required "I saved it" step. It is never sent to the server.

Table `user_keys`: `user_id`, `public_key`, `wrapped_by_password`, `wrapped_by_recovery`, `version`. The public key cannot be changed once set. Row-level security limits each user to their own row. Public keys of local mailboxes are readable by signed-in users, so Typhoonpost-to-Typhoonpost mail can be encrypted to a recipient.

## 4. Message envelope, version 1

- Per message: random 32-byte content key (CEK).
- Payload JSON (subject, from, to, cc, bcc, reply-to, text body, HTML body, snippet, selected headers, attachment manifest) is encrypted with the CEK.
- The CEK is sealed to the recipient's public key: ephemeral X25519 key, ECDH, HKDF, then AEAD.
- Stored columns: `enc_version smallint`, `enc_payload bytea`, `enc_key bytea`. Readable columns: id, mailbox, received_at, folder, is_read, is_flagged, size_bytes.
- Attachments: separate CEK per file, ciphertext in the storage bucket, name and type inside the encrypted payload.
- The version field allows the format to change without breaking old mail.

## 5. Flows

- **Inbound (Resend to `resend-inbound`):** verify webhook, run spam scoring on plaintext, encrypt to the recipient's public key, store ciphertext only, discard plaintext.
- **Read:** browser fetches ciphertext, unwraps the private key with the session key, decrypts. The privacy engine (tracker blocking, link cleaning) runs on the decrypted HTML as it does today.
- **Compose and drafts:** encrypted client-side to the user's own key before saving.
- **Send to a Typhoonpost user:** client fetches the recipient's public key and encrypts to both parties. Resend is not involved.
- **Send to an external address:** `send-email` receives plaintext once, hands it to Resend, and stores nothing. The sent copy is encrypted by the client.
- **Search:** index built and held in the browser (IndexedDB), backed up as an encrypted blob.
- **Password change:** re-wrap the private key under the new `wrapKey`. Mail is not re-encrypted.
- **Lost password, recovery key present:** unwrap with the recovery key, set a new password, re-wrap.
- **Lost both:** account is unrecoverable by design.
- **Two-factor:** continues to gate database access. It does not protect keys, and the UI must not imply it does.

### Stage 1 as built

- Keys are created at first sign-in, not at sign-up, so it works whether or not email confirmation is on.
- Accounts that predate this change are upgraded in place: if the derived sign-in fails, the app retries once with the plain password, then replaces the server-side password with the derived secret and creates keys. This fallback (`LEGACY_PASSWORD_LOGIN` in `useAuth.ts`) must be switched off before real users are invited, because it sends the typed password to the server on that attempt.
- Forgot password: the reset email signs the person in, then the app asks for the recovery key and a new password. The key wrap is saved first and the sign-in secret second, so if the second step fails the recovery key still works.
- Existing mail stays plaintext until Stage 2 and Stage 5 encrypt and then migrate it.

## 6. Consequences to design for

- No server-side search, rules or forwarding on content.
- Server-side threading needs plaintext. Open item: a thread key computed at ingest from message headers, stored as an HMAC so equal threads group without exposing subjects.
- Session handling: the unwrapped key lives in memory, with a decision pending on whether to survive page reloads via `sessionStorage`. It trades convenience against exposure to script injection.
- Existing accounts are test data and will be reset. This is only free before launch.

## 7. Staging

- **Stage 1: key infrastructure.** Derived sign-in, key generation, recovery key screen, password change, `user_keys` table.
- **Stage 2: encrypted inbound.** Envelope v1, schema columns, `resend-inbound` encrypts.
- **Stage 3: decrypt, compose, send.** Reader, drafts, sent copies, Typhoonpost-to-Typhoonpost end-to-end.
- **Stage 4: search, contacts, calendar, attachments.** Client index and encrypted contacts, events and files.
- **Stage 5: remove plaintext and harden.** Drop plaintext columns, purge backups, key rotation, lockout tests, outside review, then update the website.

## 8. Tests required before each stage ships

- Known-answer tests for every primitive.
- Round trip: encrypt in the edge function, decrypt in the browser.
- Database inspection proving no plaintext content columns are populated.
- Wrong password, wrong recovery key and tampered-ciphertext cases all fail closed with a clear message.
- Password change and recovery flows tested end to end.

## 9. Open questions

1. Decisions 2 and 3, session-persisted key and header-based thread key: owner agreed to the recommendations.
2. Which Argon2id implementation, after measuring speed on a mid-range phone.
