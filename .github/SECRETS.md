# GitHub Actions secrets — agent workflows

The `scrape.yml`, `followup.yml` and `outreach.yml` workflows read these from
**repo Actions secrets**. Add them at: **Settings → Secrets and variables →
Actions → New repository secret** (or `gh secret set NAME` from the CLI).

> Do NOT put values in this file — it's committed. Copy them from
> `job-application-agent/.env` (your local, gitignored) and the consoles below.

| Secret | Source | Required |
|---|---|---|
| `LLM_API_KEY` | OpenAI API key (`.env` → `LLM_API_KEY`) | ✅ |
| `HUNTER_API_KEY` | Hunter.io key (`.env`) — primary recruiter-email finder, capped by `HUNTER_MONTHLY_CAP` + `HUNTER_DAILY_CAP` (usage table). Set 2026-07-27; the account is on the **Free plan = 50 searches/month**. Remove the secret to skip Hunter. | ✅ (for email discovery) |
| `JSEARCH_API_KEY` | RapidAPI JSearch key (`.env`) | ✅ |
| `SUPABASE_URL` | `https://dzhnxsgrnohyswhbjthc.supabase.co` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (`.env`) | ✅ |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth web client (`.env`) | ✅ |
| `GOOGLE_CLIENT_SECRET` | same OAuth client (`.env`) | ✅ |
| `APOLLO_API_KEY` | Apollo (fallback enrichment, used when Hunter misses or its cap is spent); leave unset to skip. NOTE: Apollo's free tier blocks the people-search API — the agent detects that rejection and disables Apollo for the run, so this realistically needs a paid Apollo plan. | ⬜ optional |

## NOT secrets (don't add these)
- **Go-live toggle** `send_emails` and the **Candidate Signature** (name / email /
  LinkedIn / resume) live in the Supabase `settings` table and are controlled from
  the **dashboard**, not env. The agent reads them at runtime.
- **Tunables** (`HUNTER_MONTHLY_CAP`, `HUNTER_DAILY_CAP`, `MAX_JOBS_PER_RUN`, `MIN_SCORE`,
  `LOOKBACK_HOURS`, `SEND_THROTTLE_SECONDS`, `JSEARCH_QUERY`, `LLM_MODEL`) are set
  as plain `env:` in the workflow YAML — edit them there.
- The **Gmail refresh token** is stored in the locked `gmail_auth` Supabase table
  by the dashboard's connect flow; the agent reads it via the service role. Not env.

## Re-enrich worker (`enrich.yml`)
- Daily 08:00 UTC + manual dispatch (the dashboard "Find emails" button, and the
  per-lead "Find email for this company" button which passes a `job_id` input).
- Works down leads that have **no recruiter email**, best match score first,
  never-tried before already-tried. Hunter is searched by company **name** when
  no domain is known — that's the only path that resolves LinkedIn-sourced leads,
  whose `job_url` is a board host. A found contact re-addresses the draft and
  moves the lead `manual_apply → dry_run`.
- Spend is bounded by `min(HUNTER_DAILY_CAP, HUNTER_MONTHLY_CAP)` and **shared
  with `scrape.yml`** through the `usage` table, so both workflows draw on one
  allowance. Results are cached per company per run (10 jobs at one company = 1
  search), and known reposters (JobHub, Hire Feed…) are skipped for free.
- Sends nothing. It only fills in recipients.

## Outreach queue worker (`outreach.yml`)
- Runs every 5 min (schedule) and sends **one** due `outreach_queue` item per
  tick. Needs only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (all already set).
- Sends **nothing** unless `settings.send_emails` is true AND Gmail is connected.
  The ~8–10 min spacing between emails is set at enqueue time; the daily ceiling
  is `settings.daily_send_cap`.

## Notes
- Scheduled `followup.yml` / `outreach.yml` runs only fire on the **default
  branch (main)** and GitHub auto-disables schedules after **60 days of repo
  inactivity** — re-enable from the Actions tab if that happens.
- A run with `send_emails=false` (current state) is a safe dry-run: the pipeline
  scores, enriches (Hunter → Apollo → optional pattern), and drafts, but never
  sends. Sending is fully human-gated through the dashboard Apply button + queue.
