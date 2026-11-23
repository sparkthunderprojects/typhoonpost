/*
  # Public website content

  Content for the public marketing site (typhoonpost.com): features, plans, FAQs, plus an
  insert-only table for early-access sign-ups. Content tables are world-readable and only
  editable with the service role (Supabase dashboard / SQL). Leads can be inserted by anyone
  but never read back through the API.
*/
create table if not exists public.site_features (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('feature','security')),
  eyebrow text not null default '',
  title text not null,
  body text not null,
  icon text not null default 'mail',
  sort_order int not null default 0
);

create table if not exists public.site_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  price_monthly numeric(8,2) not null default 0,
  price_note text not null default '',
  cta_label text not null default 'Get started',
  highlighted boolean not null default false,
  features text[] not null default '{}',
  sort_order int not null default 0
);

create table if not exists public.site_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order int not null default 0
);

create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  source text not null default 'website' check (length(source) <= 60),
  created_at timestamptz not null default now()
);
create unique index if not exists site_leads_email_idx on public.site_leads (lower(email));

alter table public.site_features enable row level security;
alter table public.site_plans enable row level security;
alter table public.site_faqs enable row level security;
alter table public.site_leads enable row level security;

create policy "public_read_features" on public.site_features for select to anon, authenticated using (true);
create policy "public_read_plans" on public.site_plans for select to anon, authenticated using (true);
create policy "public_read_faqs" on public.site_faqs for select to anon, authenticated using (true);
create policy "anyone_can_join_waitlist" on public.site_leads for insert to anon, authenticated with check (true);

insert into public.site_features (section, eyebrow, title, body, icon, sort_order) values
('feature','Mail','An inbox that stays out of your way','Focused and Other sorting, flags, snooze and categories keep the messages that matter on top, so you can get through your day instead of through your inbox.','inbox',1),
('feature','Calendar','Your schedule, one click from your mail','Turn a conversation into a meeting without leaving the page. Day, week and month views live right next to your inbox.','calendar',2),
('feature','People','Contacts that know who you talk to','Frequent contacts, groups and stars are built in, and sender cards show you the person behind every message.','users',3),
('feature','Speed','Fast enough to feel instant','Realtime delivery, a command palette and full keyboard shortcuts mean most actions take a keystroke, not a trip through menus.','zap',4),
('security','Private by default','Your mail is yours alone','Every message is locked to your account at the database level. Other users and other tenants can never read it, even by accident.','lock',1),
('security','Safe to open','Hostile HTML gets stripped','Incoming messages are sanitised before they are displayed, so scripts, tracking tricks and unsafe links do not get a chance to run.','shield',2),
('security','Trusted delivery','Authenticated sending','Mail goes out through verified SPF and DKIM on your own domain, which keeps your messages out of junk folders.','badge',3),
('security','No ad business','We sell mailboxes, not attention','There is no ad profile built from your messages. Typhoonpost is paid for by the people who use it.','eye',4),
('security','Your domain','Custom domains for your team','Bring your own domain and give everyone a professional address that you control.','globe',5),
('security','Transparent','Open about how it works','Plain-language policies and a public roadmap, so you always know what is happening with your data.','file',6);

insert into public.site_plans (slug, name, tagline, price_monthly, price_note, cta_label, highlighted, features, sort_order) values
('starter','Starter','For individuals trying Typhoonpost',0,'Free during early access','Join early access',false,
 array['1 mailbox on typhoonpost.com','Mail, calendar and contacts','5 GB storage','Community support'],1),
('business','Business','For small teams that live in email',6,'per user / month, billed yearly','Start free trial',true,
 array['Custom domain','Shared and team calendars','50 GB storage per user','Priority email support','Admin console'],2),
('enterprise','Enterprise','For organisations with extra requirements',14,'per user / month, billed yearly','Talk to us',false,
 array['Everything in Business','Unlimited aliases','Audit logs and retention rules','SSO and directory sync','Dedicated success manager'],3);

insert into public.site_faqs (question, answer, sort_order) values
('What is Typhoonpost?','Typhoonpost is a modern email, calendar and contacts workspace. It is built for people who want the polish of the big suites without the clutter or the ads.',1),
('Is it ready to use today?','Typhoonpost is in early access. You can create an account, send and receive mail, and use the calendar and contacts while we finish the remaining features.',2),
('Can I use my own domain?','Yes. Business plans let you use your own domain, with sending authenticated through SPF and DKIM.',3),
('Who can read my email?','Only you. Messages are stored per account with database-level access rules, and nobody else on the platform can open them.',4),
('Do you show ads or sell my data?','No. Typhoonpost does not build ad profiles from your messages and does not sell your data.',5),
('Can I move over from another provider?','Import tools are on the roadmap. In the meantime you can forward mail from your old address while you switch over.',6),
('How much does it cost?','Starter is free during early access. Business and Enterprise plans are billed per user, and you can see the details on the pricing page.',7);
