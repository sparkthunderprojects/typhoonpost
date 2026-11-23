-- Read-only check for the zero-access stages: where does readable content still exist?
-- Counts only; never selects the content itself.
select 'emails: not yet encrypted' as check, count(*) as rows from public.emails where enc_version is null
union all
select 'emails: encrypted but readable text left', count(*) from public.emails
  where enc_version is not null
    and (sender <> '' or sender_email <> '' or subject <> '' or preview <> '' or body <> ''
         or coalesce(array_length(to_addresses, 1), 0) > 0 or coalesce(array_length(cc_addresses, 1), 0) > 0)
union all
select 'attachment rows (legacy, should be 0)', count(*) from public.attachments
union all
select 'contacts: not yet encrypted', count(*) from public.contacts where enc_version is null
union all
select 'contacts: encrypted but readable text left', count(*) from public.contacts
  where enc_version is not null
    and (first_name <> '' or last_name <> '' or email <> '' or phone <> '' or job_title <> '' or company <> '' or notes <> ''
         or coalesce(array_length(groups, 1), 0) > 0)
union all
select 'events: not yet encrypted', count(*) from public.events where enc_version is null
union all
select 'events: encrypted but readable text or times left', count(*) from public.events
  where enc_version is not null
    and (title <> '' or description <> '' or location <> '' or start_time is not null or end_time is not null)
union all
select 'accounts without keys', count(*) from auth.users u where not exists (select 1 from public.user_keys k where k.user_id = u.id);
