/*
  # Zero-access encryption, stage 2: encrypted message columns

  A message stored for a user with keys carries its content in `enc_payload` (encrypted with a
  per-message key) and `enc_key` (that key sealed to the user's public key). The old plaintext
  columns stay for now so existing mail and the compose and draft paths keep working; they are
  empty for encrypted rows and are removed in the final stage.

  Readable on purpose: id, owner, folder, read/starred/label state, snooze time, created_at, size.
*/
alter table public.emails
  add column enc_version smallint,
  add column enc_payload text,
  add column enc_key text,
  add column size_bytes integer;

alter table public.emails
  add constraint emails_encrypted_complete
  check (enc_version is null or (enc_payload is not null and enc_key is not null));
