/*
  # Mail organising: encrypted preferences, pinning and follow-up

  1. mail_prefs: one encrypted record per person holding their own folders, categories, favourites,
     rules, templates, saved searches and display choices. Names and rules live only inside the
     ciphertext. Readable columns: owner, revision, timestamps.
  2. emails.pinned and emails.follow_up_at: readable on purpose, like starred and snoozed_until.
     Neither says anything about what a message contains.
*/
create table public.mail_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enc_version smallint not null, enc_payload text not null, enc_key text not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.mail_prefs enable row level security;
create policy "select_own_mail_prefs" on public.mail_prefs for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_mail_prefs" on public.mail_prefs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update_own_mail_prefs" on public.mail_prefs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete_own_mail_prefs" on public.mail_prefs for delete to authenticated using ((select auth.uid()) = user_id);
create policy "require_mfa_when_enrolled" on public.mail_prefs as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

alter table public.emails add column pinned boolean not null default false, add column follow_up_at timestamptz;
