# External schedulers: keep-warm pings and cron jobs

Saarthi runs on the Vercel Hobby plan, so it relies on two outside services:

| Service | What it does | How often |
|---|---|---|
| **UptimeRobot** | Pings the slot API so its function stays warm, and emails when the site is down | every 5 min |
| **cron-job.org** | Runs the background jobs (outbox, reminders, session completion, calendar retry, refunds) through `/api/cron/all` | every 5 min |

## Why not GitHub Actions or Vercel Cron

- `.github/workflows/scheduled-jobs.yml` asks for every 5 minutes, but GitHub
  throttles scheduled workflows: in late November 2026 it actually ran every
  6–10 hours. It stays as a backup.
- Vercel Hobby cron runs once a day (`vercel.json` → `/api/cron/all`). It also
  stays as a backup.

All jobs are idempotent, so overlapping runs from the three schedulers are safe.

## UptimeRobot (keep-warm + downtime alerts)

1. Create a free account at uptimerobot.com.
2. **Add New Monitor**:
   - Monitor type: **HTTP(s)**
   - Friendly name: `Saarthi slots API`
   - URL:
     ```
     https://www.saarthilife.com/api/availability?therapistId=E4MhDTxy1XhOdF68WW7A&date=2026-01-01
     ```
     A past date is deliberate: the route still runs and returns 200, and the
     URL never goes stale. `E4MhDTxy1XhOdF68WW7A` is Dravina's therapist id;
     if that therapist is ever removed, swap in another active therapist id.
   - Monitoring interval: **5 minutes** (the free plan's minimum).
   - Alert contacts: your email.
3. Optional second monitor, type HTTP(s), on `https://www.saarthilife.com/`
   for a whole-site check.

Cost: about 8,600 requests a month to one function, plus a handful of
Firestore reads each, which is well inside the free tiers.

## cron-job.org (background jobs)

1. Create a free account at cron-job.org.
2. **Create cronjob**:
   - Title: `Saarthi cron/all`
   - URL: `https://www.saarthilife.com/api/cron/all`
   - Schedule: **every 5 minutes**
   - Advanced → Request method: **GET**
   - Advanced → Headers: add
     `Authorization` = `Bearer <CRON_SECRET>`, where `<CRON_SECRET>` is the
     value of `CRON_SECRET` in Vercel's production environment (Vercel →
     Project → Settings → Environment Variables). Paste it only into
     cron-job.org; never commit it.
   - Advanced → Timeout: 30 s or more (the five jobs run one after another).
   - Notifications: on failure.
3. Click **Test run**: it should return **200** with `"success": true`.
   **207** means at least one job failed (the JSON names it). **401** means
   the header or secret is wrong.

## Checking it works

- Vercel → Logs, filter path `/api/availability`: a request roughly every 5
  minutes from UptimeRobot.
- Filter path `/api/cron/all`: a `Daily backup scheduler run` log line roughly
  every 5 minutes (the message predates this setup; it is the same handler).
