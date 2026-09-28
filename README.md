# Job applications

Open dashboard for Samuel Olajide (Dundalk, Ireland, Europe/London). It keeps the apply history, scores newly discovered remote roles, and holds the queue the apply agent is allowed to submit. There is no login password.

Discovery pulls these sources in parallel:

| Source | API | Notes |
| --- | --- | --- |
| **Hiring Cafe** | `POST hiringcafe.com/api/search-jobs` | Private search; Cloudflare often blocks server hosts (fails fast after one probe) |
| **Greenhouse** | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs` | ~80 company boards (separate token list; list then detail) |
| **Ashby** | `GET api.ashbyhq.com/posting-api/job-board/{org}` | ~60 company boards (OpenAI skipped — payload too large) |
| **Lever** | `GET api.lever.co/v0/postings/{site}?mode=json` | ~10 verified Lever sites (Metabase, Spotify, Qonto, Palantir, …) |
| **LinkedIn** | `GET linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` | Public guest job cards (Ireland + remote Europe queries); may rate-limit or challenge some hosts |

Greenhouse / Ashby / Lever each need their **own** company slug — they are not one shared list. Aggregators (Jobicy, Remotive, Remote OK, LinkedIn guest search) do not need company names.
| **Jobicy** | `GET jobicy.com/api/v2/remote-jobs` | Europe/Ireland engineering + Python/TypeScript/React tags |
| **Remotive** | `GET remotive.com/api/remote-jobs` | Small recent public feed; software-adjacent categories kept |
| **Remote OK** | `GET remoteok.com/api` | Public JSON feed |

Filters follow Samuel's CV (Lead Software Engineer, 5+ years, Ireland): software roles matching Python/TypeScript/React/Node/AWS/K8s/AI keywords; Staff/Principal/Director/manager titles dropped (Senior/Lead kept); geo-blocked and Ceriga skipped. Score ≥60 auto-queues. Greenhouse/Ashby/Lever open roles ignore the 14-day age cut.

## Local

```bash
npm install
cp .env.example .env.local
# optional: set SYNC_TOKEN for the apply agent
npm run dev
```

Open http://127.0.0.1:43123 — no password.

Without `DATABASE_URL`, development stores data in `data/pglite` (gitignored). The seed CSV in `data/seed.csv` loads once. Later edits are kept.

```bash
npm test
npm run db:seed
```

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Neon Postgres connection string. |
| `SYNC_TOKEN` | Optional | Bearer token for the apply agent and sync. |
| `CRON_SECRET` | Optional | Vercel Cron calls `GET /api/discover` with this bearer token. |

The browser UI is open (no `DASHBOARD_PASSWORD`). Set agent tokens in Vercel if you use them:

```bash
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

The cron only runs when `CRON_SECRET` is set on the Vercel project. You can also search on demand from the Find jobs tab, or:

```bash
curl -X POST "$APP_URL/api/discover" \
  -H "Authorization: Bearer $SYNC_TOKEN"
```

## What the screens do

- **Tracker** — seeded history plus anything already applied, skipped, or blocked. KPIs, source mix, last 30 days in Europe/London, search, and inline status, score, location, and notes.
- **Find jobs** — applicable roles after auto-filter. Score 60+ is already queued; lower scores wait for Queue or Pass. Search box only — no manual filter toggles.
- **Queue** — roles the agent should apply to.

Response rate is `(rejected + interview + final interview + offer + recruiter contacted) / submitted`. Submitted means applied plus later pipeline statuses. Skipped, blocked, needs input, and candidates are not in that denominator. The Applied card is only the current `applied` status.

Scoring is rules on the listing text (location, CV stack, seniority band, AI/Python, project overlap, salary ~€55–80k, company, ATS link). Empty evidence scores zero. Staff/principal/director/manager titles are hidden; Senior/Lead are in band. US-only, hybrid/onsite without remote, relocation, and Ceriga are not stored.

## Agent sync

See [dashboard-sync.md](dashboard-sync.md).
