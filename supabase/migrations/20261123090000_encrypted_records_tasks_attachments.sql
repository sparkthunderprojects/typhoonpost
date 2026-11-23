/*
  # Zero-access encryption, stage 4: contacts, events, tasks, attachment files

  1. contacts and events get the same three encrypted columns as emails (enc_version, enc_payload,
     enc_key). New rows keep every readable column at its empty default; the content lives in the
     encrypted payload. Event times become optional so the real times can be kept inside it too.
  2. tasks: a new table, encrypted from the start. Only owner, ids and timestamps are readable.
  3. attachments bucket: private, ciphertext only. A person can read, write and delete objects in
     their own folder (<user id>/<file id>) and nowhere else. Files are encrypted in the browser
     with a per-file key that travels inside the encrypted message, so the bucket cannot be read
     even by someone with full access to it.
*/
alter table public.contacts
  add column enc_version smallint, add column enc_payload text, add column enc_key text;

alter table public.events
  add column enc_version smallint, add column enc_payload text, add column enc_key text,
  alter column start_time drop not null, alter column end_time drop not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  enc_version smallint not null,
  enc_payload text not null,
  enc_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_created_idx on public.tasks (user_id, created_at desc);
alter table public.tasks enable row level security;
create policy "select_own_tasks" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_tasks" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update_own_tasks" on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete_own_tasks" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);
create policy "require_mfa_when_enrolled" on public.tasks as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 11534336)
on conflict (id) do nothing;

create policy "attachments_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
create policy "attachments_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
create policy "attachments_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.mfa_ok()));
