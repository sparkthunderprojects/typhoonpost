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

## Public website (`website/`)

The marketing site lives in `website/` as a separate Next.js (App Router, server-rendered) app. It is
deployed on its own, for example as a second Vercel project with **Root Directory = `website`**.

```bash
cd website
cp .env.example .env.local   # add NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:3000
```

- Content (features, plans, FAQs) is read from the Supabase tables `site_features`, `site_plans` and
  `site_faqs` and refreshed every 5 minutes, so you can edit copy and prices in the Supabase dashboard
  without redeploying. Built-in fallback copy is used if the database is unreachable.
- Early-access sign-ups are written to `site_leads` (insert-only for the public; read them in the dashboard).
- SEO: per-page metadata and canonicals, Open Graph image, `sitemap.xml`, `robots.txt`, web manifest and
  JSON-LD (Organization, WebSite, SoftwareApplication, FAQPage, Product, BreadcrumbList).
- Set `NEXT_PUBLIC_SITE_URL` to the production domain and `NEXT_PUBLIC_APP_URL` to wherever the mail app is hosted.
