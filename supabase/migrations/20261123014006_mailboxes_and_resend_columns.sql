-- Mail domain used for every user's Typhoonpost address
CREATE OR REPLACE FUNCTION public.mail_domain() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 'typhoonpost.com'::text $$;

CREATE OR REPLACE FUNCTION public.is_valid_handle(h text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT h ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
     AND h !~ '\.\.'
     AND h NOT IN ('postmaster','abuse','admin','administrator','support','noreply','no-reply',
                   'hostmaster','webmaster','root','mailer-daemon','security','info','contact',
                   'billing','help','hello','sales','team','typhoonpost')
$$;

-- One mailbox (address) per user
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL UNIQUE CHECK (address = lower(address)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_mailbox" ON public.mailboxes FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No insert/update/delete policies: addresses are created by trigger or claim_mailbox() only.

-- Extra columns on emails for real mail
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS to_addresses text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS cc_addresses text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD CONSTRAINT emails_user_external_uniq UNIQUE (user_id, external_id);

-- Default address assignment
CREATE OR REPLACE FUNCTION public.assign_default_mailbox(uid uuid, user_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; cand text; n int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM mailboxes WHERE user_id = uid) THEN RETURN; END IF;
  base := regexp_replace(lower(split_part(coalesce(user_email,''), '@', 1)), '[^a-z0-9._-]', '', 'g');
  base := regexp_replace(base, '^[^a-z0-9]+|[^a-z0-9]+$', '', 'g');
  IF length(base) < 3 THEN base := 'user' || base; END IF;
  base := left(base, 24);
  LOOP
    cand := CASE WHEN n = 0 THEN base ELSE base || floor(random()*9000+1000)::int::text END;
    EXIT WHEN public.is_valid_handle(cand)
          AND NOT EXISTS (SELECT 1 FROM mailboxes WHERE address = cand || '@' || public.mail_domain());
    n := n + 1;
    IF n > 20 THEN
      cand := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
      EXIT;
    END IF;
  END LOOP;
  INSERT INTO mailboxes (user_id, address) VALUES (uid, cand || '@' || public.mail_domain()) ON CONFLICT DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_default_mailbox(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.assign_default_mailbox(NEW.id, NEW.email);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Backfill any users created before this migration
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, email FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.mailboxes m WHERE m.user_id = u.id)
  LOOP PERFORM public.assign_default_mailbox(r.id, r.email); END LOOP;
END $$;

-- Let signed-in users pick their own address
CREATE OR REPLACE FUNCTION public.claim_mailbox(handle text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h text := lower(trim(handle)); addr text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_valid_handle(h) THEN
    RAISE EXCEPTION 'Use 3-30 letters, numbers, dots, dashes or underscores';
  END IF;
  addr := h || '@' || public.mail_domain();
  INSERT INTO mailboxes (user_id, address) VALUES (auth.uid(), addr)
  ON CONFLICT (user_id) DO UPDATE SET address = EXCLUDED.address;
  RETURN addr;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That address is already taken';
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_mailbox(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_mailbox(text) TO authenticated;

-- Live inbox updates
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emails;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
