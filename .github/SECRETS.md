# GitHub Actions secrets — agent workflows

The `scrape.yml`, `followup.yml` and `outreach.yml` workflows read these from
**repo Actions secrets**. Add them at: **Settings → Secrets and variables →
Actions → New repository secret** (or `gh secret set NAME` from the CLI).

> Do NOT put values in this file — it's committed. Copy them from
> `job-application-agent/.env` (your local, gitignored) and the consoles below.

| Secret | Source | Required |
|---|---|---|
| `LLM_API_KEY` | OpenAI API key (`.env` → `LLM_API_KEY`) | ✅ |
| `HUNTER_API_KEY` | Hunter.io key (`.env`) — **RE-ADDED 2026-07-21**: primary recruiter-email finder, capped by `HUNTER_DAILY_CAP` (usage table). Re-adds monthly cost; remove the secret to skip Hunter. | ✅ (for email discovery) |
| `JSEARCH_API_KEY` | RapidAPI JSearch key (`.env`) | ✅ |
| `SUPABASE_URL` | `https://dzhnxsgrnohyswhbjthc.supabase.co` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (`.env`) | ✅ |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth web client (`.env`) | ✅ |
| `GOOGLE_CLIENT_SECRET` | same OAuth client (`.env`) | ✅ |
| `APOLLO_API_KEY` | Apollo (fallback enrichment); leave unset to skip | ⬜ optional |

## NOT secrets (don't add these)
- **Go-live toggle** `send_emails` and the **Candidate Signature** (name / email /
  LinkedIn / resume) live in the Supabase `settings` table and are controlled from
  the **dashboard**, not env. The agent reads them at runtime.
- **Tunables** (`HUNTER_DAILY_CAP`, `MAX_JOBS_PER_RUN`, `MIN_SCORE`,
  `LOOKBACK_HOURS`, `SEND_THROTTLE_SECONDS`, `JSEARCH_QUERY`, `LLM_MODEL`) are set
  as plain `env:` in the workflow YAML — edit them there.
- The **Gmail refresh token** is stored in the locked `gmail_auth` Supabase table
  by the dashboard's connect flow; the agent reads it via the service role. Not env.

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
