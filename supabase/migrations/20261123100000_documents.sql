/*
  # Documents (word processor), release 1a

  Every document is two encrypted records: a small "meta" record (title, excerpt, word count) used by
  the document list, and a "body" record opened only when a document is opened. Both are sealed to
  the owner's public key in the browser. Readable columns: ids, owner, timestamps, size, starred,
  trashed_at and a revision counter used to detect conflicting saves.
*/
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meta_version smallint not null, meta_payload text not null, meta_key text not null,
  enc_version smallint not null, enc_payload text not null, enc_key text not null,
  size_bytes integer not null default 0 check (size_bytes between 0 and 12582912),
  revision integer not null default 1,
  starred boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_updated_idx on public.documents (user_id, updated_at desc);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  enc_version smallint not null, enc_payload text not null, enc_key text not null,
  meta_version smallint not null, meta_payload text not null, meta_key text not null,
  label text,
  created_at timestamptz not null default now()
);
create index document_versions_doc_idx on public.document_versions (document_id, created_at desc);

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

create policy "select_own_documents" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_documents" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update_own_documents" on public.documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete_own_documents" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);
create policy "require_mfa_when_enrolled" on public.documents as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

create policy "select_own_document_versions" on public.document_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_document_versions" on public.document_versions for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid())));
create policy "delete_own_document_versions" on public.document_versions for delete to authenticated using ((select auth.uid()) = user_id);
create policy "require_mfa_when_enrolled" on public.document_versions as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
