/*
  # Calendar events

  Per-user calendar events used by the Calendar view. RLS restricts every row to its owner.
*/
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  location text not null default '',
  start_time timestamptz not null,
  end_time timestamptz not null,
  all_day boolean not null default false,
  color text not null default '#2563eb',
  created_at timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, start_time);

alter table public.events enable row level security;

create policy "select_own_events" on public.events for select to authenticated using (auth.uid() = user_id);
create policy "insert_own_events" on public.events for insert to authenticated with check (auth.uid() = user_id);
create policy "update_own_events" on public.events for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own_events" on public.events for delete to authenticated using (auth.uid() = user_id);
