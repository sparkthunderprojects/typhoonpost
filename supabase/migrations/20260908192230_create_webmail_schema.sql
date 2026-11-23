/*
# Create Veloce Mail schema (multi-user, owner-scoped)

## Overview
Creates the full database schema for the Veloce Mail webmail application.
The app has a sign-in/sign-up screen (Supabase email/password auth), so all
tables are owner-scoped: every row belongs to the authenticated user who
created it, enforced by Row Level Security policies using auth.uid().

## New Tables

### 1. profiles
Stores per-user settings that don't fit on auth.users.
- id (uuid, PK) — matches auth.users.id
- email (text) — denormalized for convenience
- display_name (text) — shown in the UI
- signature (text) — email signature appended on send
- created_at (timestamptz)
- updated_at (timestamptz)

### 2. emails
Stores every email message (inbox, sent, drafts, archive, trash, spam, snoozed).
- id (uuid, PK)
- user_id (uuid, NOT NULL, DEFAULT auth.uid()) — owner
- sender (text) — display name of sender
- sender_email (text) — sender email address
- avatar_color (text) — hex color for the avatar badge
- subject (text)
- preview (text) — short snippet shown in the list
- body (text) — full HTML body
- folder (text) — inbox | sent | drafts | archive | trash | spam | snoozed
- labels (text[]) — work | personal | urgent | finance
- category (text) — primary | promotions | social
- read (boolean, default false)
- starred (boolean, default false)
- has_replies (boolean, default false)
- snoozed_until (text, nullable)
- created_at (timestamptz, default now())

### 3. attachments
Files attached to an email. Each belongs to exactly one email.
- id (uuid, PK)
- email_id (uuid, FK → emails.id ON DELETE CASCADE)
- name (text) — file name
- size (text) — human-readable size string
- kind (text) — image | doc | pdf | slide | sheet
- url (text, nullable) — link or storage path

### 4. contacts
Address book entries. Each belongs to one user.
- id (uuid, PK)
- user_id (uuid, NOT NULL, DEFAULT auth.uid()) — owner
- first_name (text)
- last_name (text)
- email (text)
- phone (text)
- job_title (text)
- company (text)
- avatar_color (text)
- notes (text)
- groups (text[]) — work | family | vendors (plus virtual groups frequent/starred handled by flags)
- starred (boolean, default false)
- frequent (boolean, default false)
- created_at (timestamptz, default now())

## Security
- RLS enabled on every table.
- profiles: a user can read/update only their own profile row (id = auth.uid()).
- emails, contacts: full CRUD scoped to auth.uid() = user_id.
- attachments: scoped through the parent email's owner — a user can only
  access attachments whose parent email they own.
- All policies use TO authenticated (the app requires sign-in).
- user_id columns default to auth.uid() so inserts that omit the owner
  still satisfy the WITH CHECK policy.

## Indexes
- emails(user_id) — every list query filters by owner.
- emails(folder) — folder switching.
- emails(created_at DESC) — list ordering.
- contacts(user_id) — list query.
- contacts(email) — autocomplete lookup.
- attachments(email_id) — join when loading an email.
*/

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  signature text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- emails
-- ============================================================
CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT '',
  sender_email text NOT NULL DEFAULT '',
  avatar_color text NOT NULL DEFAULT '#2563eb',
  subject text NOT NULL DEFAULT '',
  preview text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT 'inbox',
  labels text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'primary',
  read boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  has_replies boolean NOT NULL DEFAULT false,
  snoozed_until text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_emails" ON emails;
CREATE POLICY "select_own_emails" ON emails FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_emails" ON emails;
CREATE POLICY "insert_own_emails" ON emails FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_emails" ON emails;
CREATE POLICY "update_own_emails" ON emails FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_emails" ON emails;
CREATE POLICY "delete_own_emails" ON emails FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);

-- ============================================================
-- attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  size text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'doc',
  url text
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_attachments" ON attachments;
CREATE POLICY "select_own_attachments" ON attachments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_attachments" ON attachments;
CREATE POLICY "insert_own_attachments" ON attachments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_attachments" ON attachments;
CREATE POLICY "update_own_attachments" ON attachments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_attachments" ON attachments;
CREATE POLICY "delete_own_attachments" ON attachments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM emails WHERE emails.id = attachments.email_id AND emails.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- ============================================================
-- contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  avatar_color text NOT NULL DEFAULT '#2563eb',
  notes text NOT NULL DEFAULT '',
  groups text[] NOT NULL DEFAULT '{}',
  starred boolean NOT NULL DEFAULT false,
  frequent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_contacts" ON contacts;
CREATE POLICY "select_own_contacts" ON contacts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_contacts" ON contacts;
CREATE POLICY "insert_own_contacts" ON contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_contacts" ON contacts;
CREATE POLICY "update_own_contacts" ON contacts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_contacts" ON contacts;
CREATE POLICY "delete_own_contacts" ON contacts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- ============================================================
-- auto-create a profile row when a new auth user signs up
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
