# Typhoonpost

An Outlook-style webmail app: Mail, Calendar and People in one place.

- **Mail:** folder tree (Favorites, Inbox, Sent Items, Drafts, Deleted Items, Junk Email, Archive, Snoozed, Flagged), Focused / Other inbox, ribbon actions (reply, move, flag, snooze, categorize), rich-text composer.
- **Calendar and People:** events and contacts, stored per user.
- **Stack:** Vite, React, TypeScript, Tailwind, Supabase (auth + Postgres with row-level security).

## Setup

```bash
cp .env.example .env   # already points at the typhoonpost Supabase project
npm install
npm run dev
```

Optional: `npm run dev:all` also starts the Express/Nodemailer server for live mail through Mailpit.

Database schema lives in `supabase/migrations/`.

## Public website

The marketing site is a separate Next.js project: `sparkthunderprojects/typhoonpost-website`.
It shares this Supabase project (tables `site_features`, `site_plans`, `site_faqs`, `site_leads`).
