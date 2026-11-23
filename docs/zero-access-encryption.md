# Zero-access encryption: Stage 0 spec

Status: Stages 1 to 4 (keys, encrypted inbound, write paths, contacts/events/tasks/drafts/attachments/search) are built and tested. Stage 5 is partly built: the in-browser migration of old data and the lockout tests are done; removing the plaintext columns, the legacy sign-in and key rotation are gated (see "Stage 5 as built").

## 1. The claim

Stored mail, contacts and events are ciphertext. Keys are created in the user's browser and never reach the server unwrapped. Typhoonpost staff, Supabase and anyone holding a database copy cannot read stored content.

### Not claimed

- **External mail is plaintext in transit.** Mail to and from other providers passes through Resend. The inbound function sees a message briefly, encrypts it, and discards the plaintext. This is "encrypted at rest", not end-to-end. Only mail between two Typhoonpost users is end-to-end.
- **Browser-delivered code must be trusted.** A compromised server could ship malicious JavaScript. Mitigations: strict CSP, no third-party scripts, pinned dependencies, open-source client. Not eliminated.
- **Metadata that stays readable:** timestamps, folder, read and flag state, size, and the account a message belongs to.

The public website must not use the words "zero-access" until Stage 5 has migrated existing data and removed the plaintext columns, and must repeat these limits when it does.

## 2. Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Losing both password and recovery key means the mail is unrecoverable. No server-side reset. | Confirmed by owner |
| 2 | Subject, sender, recipients, snippet, body, attachments (including file names) are encrypted. Timestamps, folder, flags, size stay readable. | Confirmed by owner |
| 3 | Stages 1 to 3 ship before any real user is invited. | Confirmed by owner |

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
- Stored columns: `enc_version smallint`, `enc_payload text`, `enc_key text` (both base64). Readable columns: id, owner, created_at, folder, read, starred, labels, snooze time, size_bytes. The Focused/Other category is decided at arrival and kept inside the payload.
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

### Stage 2 as built

- `resend-inbound` encrypts every message to the recipient's public key and stores no readable subject, sender, recipients, body, preview or attachment names. Tested under Deno: stored rows contain none of the content, retried webhooks do not duplicate, each recipient gets their own ciphertext, and a different key cannot open it.
- An account with no keys yet (a legacy account that has not signed in since the upgrade) gets nothing stored. The function answers 503 so Resend retries. If the account is still keyless when Resend stops retrying, that message is lost; this only affects the two pre-existing accounts, and only until they sign in once.
- The browser decrypts on read (`src/lib/db.ts`). A message that cannot be decrypted shows a clear placeholder instead of breaking the list. This was planned for Stage 3 but moved here so new mail is never shown blank.
- Attachment files are still not stored, only names and sizes (inside the payload). Real attachment storage is Stage 4.
- The edge function shares `bytes.ts`, `seal.ts` and `envelope.ts` with the web app through a sync script (`scripts/sync-edge-crypto.mjs`); a test fails if the copies drift.

### Stage 3 as built

- Sent copies are encrypted in the browser to the sender's own key before they are saved (`src/lib/outgoing.ts`, `insertEmail` in `src/lib/db.ts`). If the key is locked, saving throws rather than storing plaintext. The sent copy is saved first, so it survives a failed delivery.
- Mail between Typhoonpost users never passes through Resend. The sender's browser looks up the recipient's public key (`public_keys_for_addresses`, signed-in users only), encrypts a separate copy per recipient, and the `deliver-local` function stores it. The function sees only ciphertext and the recipient address.
- Sender authenticity: the sender encrypts the message, so nothing inside it can be trusted to name the sender. `deliver-local` adds an attestation (`emails.enc_attest`): the sender's address from the server's own records, bound to the ciphertext by SHA-256 and sealed to the recipient. The recipient's browser shows the attested address and ignores the one in the payload. Tested: spoofed sender, wrong recipient, swapped ciphertext and tampered attestation are all rejected.
- Daily limit of 300 local deliveries per account, counted in `delivery_log` (sender and time only, never recipient or content).
- If the key lookup fails, nothing is delivered (neither local nor external), so a local recipient is never sent a plaintext copy through Resend. External recipients still go through Resend and are visible to it, as for any outside mail.
- What the server learns: the delivery function sees who sends to whom at delivery time. The key lookup reveals whether a Typhoonpost address exists.
- Drafts are not persisted today (autosave is a no-op), so there is nothing to encrypt yet. Encrypted drafts come with Stage 4.
- Tests: Deno handler tests, vitest end-to-end tests that run the real delivery handler (Alice to Bob, spoofing, tampering), and a browser test of the send flow with a mocked server (sent copy and delivery requests hold no readable content, local and external recipients are routed separately, lookup failure sends nothing). Live Supabase and Resend paths were not exercised from the development sandbox.

### Stage 4 as built

- **Contacts and events** are stored as one encrypted record each (`src/lib/crypto/record.ts`: random content key per record, sealed to the owner's key, record kind bound in as associated data so a contact ciphertext cannot be opened as a task). New rows keep every readable column at its empty default. Event start and end times are kept inside the record too, so the server cannot see when someone has something on. Old plaintext rows still display and are re-saved encrypted the first time they are edited; the rest wait for Stage 5.
- **Tasks** are a new feature, encrypted from the first row (`tasks` table: owner, ids and timestamps are the only readable columns). View with My Day, Important, Planned, Tasks and Completed lists, due dates, notes, undo on delete, included in the data export and in search.
- **Drafts** are saved while typing, encrypted to the owner's key, as one row that is updated in place (saves are queued so a fast second save cannot create a duplicate). A draft can be reopened from the Drafts folder, with its attachments, and is deleted when the message is sent or discarded.
- **Attachment files** are encrypted in the browser with a random key per file (XChaCha20-Poly1305, 10 MB per file, 25 MB per message) and uploaded to the private `attachments` bucket under `<user id>/<file id>`. The key and file name live only inside the encrypted message. Bucket policies allow each person to read, write and delete only their own folder. For a Typhoonpost recipient, `deliver-local` copies the ciphertext objects into the recipient's folder under the same ids (only from the sender's own folder, validated as UUIDs), so the recipient's copy of the message needs no change. Deleting the account first removes the person's stored files.
- **Search** runs in the browser over data already decrypted for the session, with no query or result ever sent anywhere: every typed word must match (any order, ignoring case and accents) across sender, recipients, subject, body text (markup stripped), attachment names, contact fields, event fields and task text. It works for mail, people, calendar and tasks.
- Tests: 34 vitest tests (record and file round trips, tamper, wrong key, wrong kind; search), 16 Deno handler tests (including file-copy path checks), a 26-check browser test of the full flow, and regressions of the earlier stages. Live Supabase storage and the deployed function were not exercised end to end from the development sandbox.

Known limits of Stage 4:

- The search index is rebuilt in memory each session from the mail already loaded. That is simple and private, but it means the app loads all mail at start, which will not scale to very large mailboxes. A persisted encrypted index is deferred.
- Attachments go only to Typhoonpost recipients. The outside mail path carries message text, so a message with attachments to an outside address is not sent and the person is told why. Attachments on incoming outside mail are still names and sizes only; storing them needs the inbound function to fetch and encrypt each file, which depends on the Resend setup.
- Deleting a draft or a sent message from the Deleted Items folder does not yet delete its stored attachment files (they stay as unreadable ciphertext until the account is deleted).
- Lookup reveals whether an address exists, and storage reveals the number and approximate size of a person's files.

### Stage 5 as built

Shipped:
- `src/lib/migrate.ts` runs after sign-in, once the key is in memory. It finds rows with `enc_version is null` (emails, contacts, events), encrypts them to the user's own public key, writes the encrypted fields, and blanks the readable columns in the same update. Legacy attachment rows are deleted. Failures are counted and retried on the next sign-in; a second run touches nothing.
- Fail-closed tests: the key lives only in memory and sessionStorage, a locked tab shows no content, repeated wrong passwords stay locked, a damaged key blob fails closed, sign-out clears the key.
- `scripts/inspect-plaintext.sql`: read-only counts of rows and accounts that still hold readable content.

Gated, not done:
- Removing the plaintext columns: `supabase/pending/20261124000000_drop_plaintext_columns.sql` is prepared and not applied. It refuses to run while any unencrypted row remains. Needs both accounts to sign in with the new client first.
- `LEGACY_PASSWORD_LOGIN` stays true until the account without keys has signed in once.
- Key rotation: deferred. The public key is immutable by trigger. Design: an edge function that checks the current auth secret, then allows a public-key change while a resumable re-seal runs and the old key stays wrapped until it finishes.
- Outside security review, and the "zero-access" claim on the website, wait for the column drop and the review.

Limits that remain: database backups keep old plaintext until they expire and cannot be purged from here; profile display name and signature stay readable; attachments to external recipients are unsupported.

Live state when written: 36 emails and 30 contacts unencrypted across two accounts, one account without keys.

## 6. Consequences to design for

- No server-side search, rules or forwarding on content.
- Server-side threading needs plaintext. Open item: a thread key computed at ingest from message headers, stored as an HMAC so equal threads group without exposing subjects.
- Session handling (decided): the unwrapped key lives in memory and is mirrored to `sessionStorage`, so a refresh does not ask for the password but a new tab or a closed browser does. Any script on the page could read it, which is why the app serves no third-party scripts.
- Existing accounts are upgraded in place (see Stage 1 as built). Migrating real users later would be much harder.

## 7. Staging

- **Stage 1: key infrastructure.** Derived sign-in, key generation, recovery key screen, password change, `user_keys` table.
- **Stage 2: encrypted inbound.** Envelope v1, schema columns, `resend-inbound` encrypts.
- **Stage 3: write paths (done).** Sent copies encrypted by the browser, Typhoonpost-to-Typhoonpost end-to-end. Drafts are not persisted yet.
- **Stage 4: search, contacts, calendar, tasks, attachments, drafts (done).** See Stage 4 as built for what is deferred.
- **Stage 5: remove plaintext and harden.** Drop plaintext columns, purge backups, key rotation, lockout tests, outside review, then update the website.

## 8. Tests required before each stage ships

- Known-answer tests for every primitive.
- Round trip: encrypt in the edge function, decrypt in the browser.
- Database inspection proving no plaintext content columns are populated.
- Wrong password, wrong recovery key and tampered-ciphertext cases all fail closed with a clear message.
- Password change and recovery flows tested end to end.

## 9. Open questions

1. Decisions 2 and 3, session-persisted key and header-based thread key: owner agreed to the recommendations.
2. Argon2id (from `@noble/hashes`) still needs timing on a mid-range phone.
