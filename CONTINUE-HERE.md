# ▶ CONTINUE HERE — OneCrew Leads Hub

> Handoff note. Read this, then memory `onecrew-leads-hub.md` + `job-application-agent.md`.

## What this is
Premium dashboard (brand **One Crew**) for the Python **job-application agent** (`../job-application-agent/`).
The agent writes leads to Supabase; this dashboard reads them + holds the Candidate Signature config.

## Stack & coordinates
- **Next.js 16** (App Router, Turbopack) + React 19 + **Tailwind v4** + TypeScript, deploy on **Vercel**
- Supabase project_ref `dzhnxsgrnohyswhbjthc`; tables `applications` (+ `application_stats` view) and `settings` (singleton Candidate Signature)
- Env in `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (server-only, for settings writes)
- GitHub (push later): https://github.com/npmsami/OneCrewLeadsDash.git

## Built so far (✅ verified: `npm run build` clean, dev server renders real data)
- Theme `src/app/globals.css` (dark, glass, indigo→cyan accent); `src/lib/status.ts` status→chip map
- `src/lib/supabase.ts` (`supabaseRead` anon / `supabaseAdmin` service-role); `src/lib/types.ts`
- `src/components/Sidebar.tsx`, `StatusBadge.tsx`
- Pages: `/` Overview (stat cards + recent activity), `/leads` (full table), `/settings` (Candidate Signature — **read-only for now**)
- Run: `npm run dev` → http://localhost:3000

## Git / deploy
- Pushed to **https://github.com/npmsami/OneCrewLeadsDash** (`main`). Auth: gh account `iamsyedmurtaza-creator` (collaborator). Next app is at repo ROOT.
- **Vercel auto-deploys on push.** Env vars set (4): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable), `SUPABASE_SERVICE_ROLE_KEY` (secret), `DASHBOARD_PASSWORD`.
- **TWO deploy gotchas (both fixed, keep in mind):**
  1. Project `framework` was `null` → Vercel ran `next build` but didn't apply Next.js routing → every route 404'd. Fixed by committing **`vercel.json` `{ "framework": "nextjs" }`** — DO NOT remove it.
  2. Vercel git-author protection blocks deploys whose commit author isn't the connected account. **Commits MUST be authored as `npmsami`** (`209180841+npmsami@users.noreply.github.com`). Repo git config is set to this; keep it. (Author, not pusher — gh pushes as collaborator `iamsyedmurtaza-creator`, fine.)
- Verified live: production alias `/login` returns 200 (One Crew login). Deploys are READY.
- **Vercel team:** "Sami's projects" (`team_4V6fxyHdKFKmlcqCJYjKnnN3`); project `prj_PIdSvFagk21UrSwki8KcGz26PDAt`.
- **Canonical URL:** https://one-crew-leads-dash-samis-projects-e3fc9c86.vercel.app/ (bare `one-crew-leads-dash.vercel.app` 404s — quirk; use team-scoped).
- **Access = app-level password gate** (Next 16 `src/proxy.ts` + `/login`, cookie `oc_auth` = sha256 of password). Env `DASHBOARD_PASSWORD` gates the whole app; if unset, gate is fail-open (dormant). Protected pages live in `src/app/(dashboard)/`; `/login` has its own minimal layout.
- Go-live access steps (user does in Vercel): 1) add env `DASHBOARD_PASSWORD`, 2) Redeploy, 3) Settings → Deployment Protection → Vercel Authentication = Disabled. Then open the canonical URL → app login → password. Local dev password in `.env.local` = `onecrew-dev` (local only).

## Go-live plan + decisions (2026-06-28)
- Sending account: **Google Workspace custom domain** (user setting up domain+Workspace) — for deliverability (DKIM/DMARC, 2k/day). NOT plain gmail.
- Templates: **seeded defaults, user edits** — `settings.email_template` + `followup_template` (DONE; dashboard textareas + agent `email_writer` follows them, GPT fills `[brackets]`, placeholders `{recruiter_name}/{company}/{role}/{signature}`).
- Dedup: **per-role** (no per-company rule). Existing job_id + (title+company) dedup is the no-double-apply guarantee.
- Deliverability: send via Gmail API from the Workspace address; plain-text, personalized, spaced sends, volume ramp.

## Gmail connect (DONE on dashboard side)
- OAuth flow: `/api/google/auth` + `/api/google/callback`. Refresh token in **locked `gmail_auth` table** (RLS deny-all; service-role only). Settings page shows Connect/Reconnect + status.
- Env needed (dashboard + Vercel): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (web client; redirect URIs registered: team-scoped vercel `/api/google/callback` + localhost). Scopes gmail.send + gmail.readonly + email.
- User connects on the live site with the Workspace sending address.
- GOTCHA: "Google OAuth isn't configured" = GOOGLE_CLIENT_ID/SECRET not on the live deployment → add in Vercel (Production) + REDEPLOY.

## Resume = uploaded file (NOT Drive link)
- Private Supabase Storage bucket **`resumes`** (5MB, PDF only). Dashboard Settings has an upload (`ResumeUpload` + `uploadResumeAction`); stores object at path `resume.pdf`, sets `settings.resume_url`=storage path + `resume_filename`=original name. Agent downloads via service role from bucket to attach. Storage round-trip verified.

## ▶ SESSION UPDATE 2026-06-30 (agent side — big progress)
Architecture reshaped + 3 steps shipped. Agent lives at `../job-application-agent/agent/` (still a SEPARATE local folder, NOT yet in git — will become a **monorepo subfolder** of this repo in step 4).

**New run model (user's design):**
- **Scrape = MANUAL dashboard button**, server-enforced **24h cooldown lock** (store `last_scrape_at`, check in `/api/scrape` before dispatch). Click → GitHub Actions `workflow_dispatch`. One scrape/day.
- **Follow-up = AUTO cron**, daily **12am Pakistan = `0 19 * * *` UTC** (PKT=UTC+5, no DST). Runs followup.py: inbox reply check → send follow-ups → status updates (dashboard reads Supabase).
- Trigger mechanism = **GitHub Actions** (free, no server). Dashboard button → Next API route (holds GitHub token) → GitHub dispatch API.

**DONE this session (all verified):**
1. ✅ **Hunter daily cap** — Starter=500/mo → `HUNTER_DAILY_CAP=15` (~450/mo). New Supabase `usage` table (day pk, hunter_calls; RLS-locked). pipeline computes `budget=15−spent_today`, enriches fresh within budget, then **drains backlog** of scored-but-unenriched rows (best score first) so a big free pile flows out ~15/day across the month. Discovery+scoring UNCAPPED. `MAX_JOBS_PER_RUN` 10→30. (smoke_hunter_cap.py)
2. ✅ **Gmail layer `agent/google.py`** — plain requests + stdlib email (no google libs). `access_token()` mints from gmail_auth refresh token + GOOGLE_CLIENT_ID/SECRET; `send_email()` attaches resume from `resumes` bucket; `fetch_inbox()`→[{sender,ts}] for reply detection; `is_ready()` guard. **LIVE-verified**: connected as **growth@onecrewtech.com**, inbox read + real test send both worked. Creds now in agent `.env` (client_id 428003591947-…, project onecrew-500802). (smoke_gmail_offline.py / smoke_gmail_live.py)
3. ✅ **Wired into pipeline + followup** — pipeline `_send_cold_email` (→status `applied`; fail→`send_error`), followup `_send_followup` (no resume re-attach; uses real inbox). Both gated `sending = settings.send_emails AND google.is_ready`. New knob `SEND_THROTTLE_SECONDS=30`. **Gate poised at DRY-RUN** (gmail ready=True, send_emails=False). Flipping `settings.send_emails` is the ONLY remaining go-live switch.

## ▶ Steps 4 & 5 — DONE (pushed 2026-06-30)
4. ✅ **GitHub Actions + monorepo**: agent now lives in THIS repo at `agent/` (runtime `cd agent && python -m agent.pipeline|followup`); `.vercelignore` excludes it from Vercel. Workflows live+active: `Scrape leads (manual)` (id 304332489, `workflow_dispatch`) + `Follow-up engine (daily)` (id 304332488, `0 19 * * *` UTC = 12am PKT + dispatch). Secrets checklist: `.github/SECRETS.md`.
5. ✅ **Dashboard Scrape button**: server action `src/app/(dashboard)/scrape-action.ts` (server-side 24h lock via `run_state` table → dispatches scrape.yml via GitHub API) + `src/components/ScrapeButton.tsx` (live countdown) + Overview "Hunter today X/15". `send_error` chip added. Build green.

## ▶ CI VERIFIED GREEN (2026-06-30) — the whole runner works
First successful end-to-end scrape on GitHub Actions: 217 discovered → 30 processed → run complete `{dry_run:11, geo_blocked:12, low_match:6, manual_apply:1}`, Hunter 12/15. **30 real leads now in Supabase `applications`** (dashboard shows them). Dispatch + button confirmed working. Still dry-run (`send_emails=false`) — the 11 drafts are NOT sent.
- ✅ `GITHUB_DISPATCH_TOKEN` added (button dispatches CI).
- ✅ 7 Actions secrets set correctly. **GOTCHA (cost ~1h):** `gh secret set NAME --body -` stores a literal `-`, NOT stdin → showed as supabase "Invalid URL". Correct: `printf '%s' "$v" | gh secret set NAME --repo R` (no --body), or `--body "$v"`.
- NOTE: the dashboard Scrape button is on its 24h cooldown (keyed to the user's first click ~2026-06-29 23:45 UTC; the verified runs went via `gh`, which bypasses the lock). Reset by clearing `run_state.last_scrape_at` if you want to click again sooner.

## ▶ GO-LIVE CHECKLIST (remaining — user actions)
1. **Upload resume PDF** in dashboard Settings (`resumes` bucket is EMPTY → emails would send unattached; body says "Resume attached").
2. **Flip `settings.send_emails=true`** in dashboard Settings = go live (Gmail layer live-verified; gate currently holds at dry-run). Next scrape/follow-up then actually sends.
3. Skim a few of the 11 drafts in `/leads` first (subjects look grounded/strong).
4. Retire the stale old agent folder `../job-application-agent/` (CI is green; monorepo `agent/` is canonical). Keep its `.venv`/`.env` if you still run smokes locally.
- Later: DKIM/DMARC checklist for onecrewtech.com; JSearch multi-query expansion; raise discovery volume.

## Working style
Incremental — ONE step per turn, check in between. Dry-run footing (send_emails=false) until the user flips go-live.
