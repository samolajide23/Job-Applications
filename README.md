# Job applications

Private dashboard for Samuel Olajide (Dundalk, Ireland, Europe/London). It keeps the apply history, scores newly discovered remote roles, and holds the queue the apply agent is allowed to submit.

Discovery uses four sources, in this order:

- **Hiring Cafe** — remote Ireland/EU-flexible search against their private `search-jobs` API (no public API; Cloudflare may block some hosts)
- **Jobicy** — Europe and Ireland engineering feeds
- **Remotive** — software-dev feed
- **Remote OK** — public JSON feed

Auto-queue is on by default. New roles that score ≥60, are not senior titles, look Ireland/EU eligible, and match at least one keyword (AI, LLM, Python, full-stack, …) land in **Queue**. Already tracked URLs are never overwritten.

## Local

```bash
npm install
cp .env.example .env.local
# set DASHBOARD_PASSWORD and SYNC_TOKEN
npm run dev
```

Open http://127.0.0.1:43123 and sign in.

Without `DATABASE_URL`, development stores data in `data/pglite` (gitignored). The seed CSV in `data/seed.csv` loads once. Later edits are kept.

```bash
npm test
npm run db:seed
```

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `DASHBOARD_PASSWORD` | Yes | Login gate. The URL is not public. |
| `SYNC_TOKEN` | Yes | Bearer token for the apply agent and sync. |
| `DATABASE_URL` | Production | Neon Postgres connection string. |
| `CRON_SECRET` | Optional | Vercel Cron calls `GET /api/discover` with this bearer token. |

Set them in Vercel for Production, Preview, and Development:

```bash
printf '%s' "$DASHBOARD_PASSWORD" | vercel env add DASHBOARD_PASSWORD production
printf '%s' "$SYNC_TOKEN" | vercel env add SYNC_TOKEN production
printf '%s' "$CRON_SECRET" | vercel env add CRON_SECRET production
```

Repeat for `preview` and `development` if you use those environments.

## Database

Production uses [Neon](https://neon.tech) through `@neondatabase/serverless`.

```bash
vercel link
vercel integration add neon
vercel env pull .env.local --yes
```

The first request creates the tables and loads `data/seed.csv` with `ON CONFLICT (url) DO NOTHING`, so a redeploy does not overwrite statuses you already changed.

No Neon account yet? Create a claimable database (it expires after 72 hours until you open the `claim_url` and keep it):

```bash
curl -sS -X POST https://neon.new/api/v1/database \
  -H 'Content-Type: application/json' \
  -d '{"ref":"job-applications"}'
```

Put `connection_string` in `DATABASE_URL`. Use the pooled URL (hostname contains `-pooler`) for the app.

`npm run db:seed` runs the same load.

## Deploy

The app is a Next.js App Router project. `vercel.json` pins the London region (`lhr1`) and a daily discover cron at 06:30 UTC.

```bash
vercel link
vercel --prod
```

Redeploy after env or seed changes:

```bash
vercel --prod
```

The cron only runs when `CRON_SECRET` is set on the Vercel project. You can also pull on demand from the Candidates tab, or:

```bash
curl -X POST "$APP_URL/api/discover" \
  -H "Authorization: Bearer $SYNC_TOKEN"
```

## What the screens do

- **Tracker** — seeded history plus anything already applied, skipped, or blocked. KPIs, source mix, last 30 days in Europe/London, search, and inline status, score, location, and notes.
- **Candidates** — discovered roles with keyword, seniority, eligibility, source, company, recency, and score filters. Queue or pass a role. Save the same filters as auto-queue rules.
- **Queue** — roles the agent should apply to.

Response rate is `(rejected + interview + final interview + offer + recruiter contacted) / submitted`. Submitted means applied plus later pipeline statuses. Skipped, blocked, needs input, and candidates are not in that denominator. The Applied card is only the current `applied` status.

Scoring is rules on the listing text (location, skills, seniority, AI/Python, project overlap, salary, company, ATS link). Empty evidence scores zero. It does not guess a fit. Senior, staff, principal, lead, director, head, and manager titles are hidden by default. US-only, hybrid/onsite, relocation, and Ceriga roles are not stored.

## Agent sync

See [dashboard-sync.md](dashboard-sync.md).
