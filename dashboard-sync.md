# Dashboard sync

The apply agent does not search boards. This dashboard discovers roles and queues the ones to submit. Use the production URL and `SYNC_TOKEN`.

Send the token on every call:

```http
Authorization: Bearer $SYNC_TOKEN
```

`X-Sync-Token: $SYNC_TOKEN` also works.

## 1. Read the queue

```bash
curl -sS "$APP_URL/api/queue" \
  -H "Authorization: Bearer $SYNC_TOKEN"
```

Response:

```json
{
  "jobs": [
    {
      "id": "…",
      "url": "https://jobs.ashbyhq.com/acme/role/application",
      "company": "Acme",
      "title": "Software Engineer",
      "source": "Jobicy",
      "location": "Europe",
      "score": 72,
      "status": "queued",
      "notes": null,
      "tags": ["python"],
      "postedAt": "2026-09-23T00:00:00.000Z",
      "excerpt": "…"
    }
  ]
}
```

Apply only to `status: "queued"`. Prefer the `url` (an ATS link when the board description contained one, otherwise the board listing).

## 2. Report the outcome

```bash
curl -sS -X PATCH "$APP_URL/api/applications/JOB_ID" \
  -H "Authorization: Bearer $SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"applied","notes":"Submitted on Ashby"}'
```

Use `applied`, `skipped`, or `blocked`, plus a short note (captcha, OTP, out of scope, confirmation). Later pipeline values are also accepted: `assessment`, `recruiter_contacted`, `interview`, `final_interview`, `rejected`, `withdrawn`, `offer`, `no_response`, `needs_input`.

The same call can set `score` (0–100) or `location`.

Upsert by URL when you do not have the id:

```bash
curl -sS -X POST "$APP_URL/api/applications" \
  -H "Authorization: Bearer $SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2026-09-24T10:00:00+01:00",
    "company": "Acme",
    "title": "Software Engineer",
    "url": "https://jobs.ashbyhq.com/acme/role/application",
    "source": "Ashby",
    "status": "applied",
    "notes": "Submitted on Ashby",
    "location": "Remote Ireland"
  }'
```

POST updates only the fields you send. A new URL needs `company`, `title`, `source`, and `status`. Matching is by normalized URL (trailing slash ignored).

Bulk history sync:

```bash
curl -sS -X POST "$APP_URL/api/applications" \
  -H "Authorization: Bearer $SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"applications":[ { "url": "https://…", "company": "Acme", "title": "Engineer", "source": "Ashby", "status": "applied", "timestamp": "2026-09-24T10:00:00+01:00" } ]}'
```

Or paste CSV in the dashboard. Header: `timestamp,company,title,url,source,status`. Optional: `score,location,notes`.

## 3. Do not search boards in the agent

Discovery runs here:

- Candidates → **Pull new roles**
- `POST /api/discover` with `SYNC_TOKEN`
- Vercel Cron `GET /api/discover` daily at 06:30 UTC when `CRON_SECRET` is set

Auto-queue is off until Samuel saves rules with **Auto-queue new matches**. Until then, only roles he marks **Queue** appear in `GET /api/queue`.
