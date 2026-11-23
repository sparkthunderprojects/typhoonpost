/*
  # Zero-access encryption, stage 5b: remove the plaintext columns

  NOT APPLIED. Kept outside supabase/migrations on purpose. Apply it only after:
    1. every account has signed in with the migrating client (scripts/inspect-plaintext.sql shows
       0 unencrypted rows and 0 accounts without keys), and
    2. the client that no longer reads or writes these columns is deployed.

  The guard below stops the migration if any readable content is still present, so applying it
  early fails safely instead of destroying data.
*/
do $$
begin
  if exists (select 1 from public.emails where enc_version is null)
     or exists (select 1 from public.contacts where enc_version is null)
     or exists (select 1 from public.events where enc_version is null)
     or exists (select 1 from public.attachments) then
    raise exception 'Unencrypted rows remain. Every account must sign in with the new client first.';
  end if;
end $$;

alter table public.emails
  drop column sender, drop column sender_email, drop column avatar_color, drop column subject,
  drop column preview, drop column body, drop column category, drop column to_addresses,
  drop column cc_addresses,
  alter column enc_version set not null, alter column enc_payload set not null, alter column enc_key set not null;
alter table public.emails drop constraint if exists emails_encrypted_complete;

drop table public.attachments;

alter table public.contacts
  drop column first_name, drop column last_name, drop column email, drop column phone,
  drop column job_title, drop column company, drop column avatar_color, drop column notes,
  drop column groups, drop column starred, drop column frequent,
  alter column enc_version set not null, alter column enc_payload set not null, alter column enc_key set not null;

alter table public.events
  drop column title, drop column description, drop column location, drop column start_time,
  drop column end_time, drop column all_day, drop column color,
  alter column enc_version set not null, alter column enc_payload set not null, alter column enc_key set not null;
