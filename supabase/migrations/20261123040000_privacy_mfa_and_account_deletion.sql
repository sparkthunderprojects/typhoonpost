/*
  # Privacy hardening

  1. mfa_ok(): true when the caller has no verified second factor, or has proven it this session (aal2).
  2. Restrictive RLS policies on every user table: once two-factor is on, a password alone cannot read mail.
  3. delete_my_account(): permanent deletion of the caller's account and (via cascades) all of their data.
*/
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'
      )
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

create policy "require_mfa_when_enrolled" on public.emails as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "require_mfa_when_enrolled" on public.attachments as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "require_mfa_when_enrolled" on public.contacts as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "require_mfa_when_enrolled" on public.events as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "require_mfa_when_enrolled" on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "require_mfa_when_enrolled" on public.mailboxes as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.mfa_ok() then raise exception 'Confirm your second factor first'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
