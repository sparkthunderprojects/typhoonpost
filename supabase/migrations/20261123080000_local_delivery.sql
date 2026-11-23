/*
  # Zero-access encryption, stage 3: delivery between Typhoonpost users

  1. emails.enc_attest: the sender's address, sealed to the recipient by the delivery function
     (see src/lib/crypto/attest.ts). Not readable by the database.
  2. delivery_log: one row per local delivery, used only to cap how many messages an account can
     send per day. It records who sent and when, never to whom or what.
  3. public_keys_for_addresses(): lets a signed-in user fetch the public key of a Typhoonpost
     address so they can encrypt to it. Public keys are meant to be shared; the lookup does
     reveal whether an address exists, as every mail system does.
*/
alter table public.emails add column enc_attest text;

create table public.delivery_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index delivery_log_user_created on public.delivery_log (user_id, created_at desc);
-- No policies: only the service role (the delivery function) can read or write it.
alter table public.delivery_log enable row level security;

create or replace function public.public_keys_for_addresses(addrs text[])
returns table (address text, public_key text)
language sql stable security definer set search_path = public as $$
  select m.address, k.public_key
  from public.mailboxes m
  join public.user_keys k on k.user_id = m.user_id
  where m.address = any (select lower(a) from unnest(addrs[1:50]) as a)
$$;
revoke execute on function public.public_keys_for_addresses(text[]) from public, anon;
grant execute on function public.public_keys_for_addresses(text[]) to authenticated;
