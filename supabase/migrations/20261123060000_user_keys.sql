/*
  # Zero-access encryption, stage 1: per-user key storage

  Holds only what is safe for the server to see: the public key, and the private key wrapped
  (encrypted) twice in the browser, once under the password-derived key and once under the
  recovery key. The server can never unwrap either.

  - Owners can read, create and update their own row. Nobody can delete it directly; it goes
    when the account is deleted.
  - The public key can never be changed once set, so a stolen session cannot redirect future
    mail to a different key.
  - Like every other user table, it is closed to password-only sessions once two-factor is on.
*/
create table public.user_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_key text not null,
  wrapped_by_password text not null,
  wrapped_by_recovery text not null,
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_keys enable row level security;

create policy "own keys: read" on public.user_keys for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own keys: create" on public.user_keys for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own keys: update" on public.user_keys for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "require_mfa_when_enrolled" on public.user_keys as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

create or replace function public.user_keys_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.public_key <> old.public_key then
    raise exception 'The public key of an account cannot be changed.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger user_keys_guard before update on public.user_keys
  for each row execute function public.user_keys_guard();
