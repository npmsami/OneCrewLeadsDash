# ▶ CONTINUE HERE — OneCrew Leads Hub

> Handoff note. Read this, then memory `onecrew-leads-hub.md` + `job-application-agent.md`.

## What this is
Premium dashboard (brand **One Crew**) for the Python **job-application agent** (`../job-application-agent/`).
The agent writes leads to Supabase; this dashboard reads them + holds the Candidate Signature config.

## ▶ SESSION UPDATE 2026-07-21 — Human-gated outreach + leads ops (NOT pushed)
Big feature build. Migration `supabase/migrations/0002_outreach_and_status.sql` (APPLIED to prod). Agent + dashboard both build/typecheck clean; **22 pytest + 23 vitest green**. Nothing sends until `settings.send_emails=true`.
- **DB:** `applications` +`app_status`(remaining|queued|applied|done|failed)+`qualified`+`publisher`; new tables `outreach_queue` (edited email + partial-unique-index dup-send guard), `resumes` (multi, PDF/DOCX), `scrape_runs` (stats); `settings` +`default_resume_id`+`daily_send_cap`; `application_stats` view extended (security_invoker).
- **Agent:** Hunter re-added (primary email finder, capped, rate/credit-safe — reverses the cost-cut); Himalayas re-enabled; **Glassdoor/Monster arrive via JSearch `job_publisher` tagging** (no scraper — see `docs/SOURCES.md`); pipeline **no longer auto-sends** (every lead = draft, app_status stays `remaining`) + writes a `scrape_runs` summary; new `agent/outreach.py` worker (one due send/tick, optimistic-lock claim, idempotent) + `.github/workflows/outreach.yml` (`*/5` cron); `google.send_email` now supports DOCX.
- **Dashboard:** fixed the broken filter route (was pushing to `/leads`, page is `/job-applications/leads`); filters extended (app_status, qualified, source incl. glassdoor/monster/himalayas, score, email availability) + count bar; Overview scrape-stats panel + score-sorted, clickable Recent Activity; **new lead detail page** `/job-applications/leads/[jobId]` with editable email review (recipient/subject/body/resume) → **Apply queues (never sends)** + cancel/retry + Mark Applied/status dropdown; multi-resume manager in Settings. Pure helpers `src/lib/{leads,outreach,resumes}.ts` are unit-tested.
- **User TODO to go live:** (1) add `HUNTER_API_KEY` GH Actions secret (re-adds cost — cancel note: it was dropped 7/01); (2) upload a resume in Settings; (3) push (adds `outreach.yml` cron on main); (4) flip `settings.send_emails=true` when ready. Test locally with the RETIRED venv: `cd agent && <retired>/.venv/Scripts/python -m pytest`; `npm run test`.

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

## ▶ SESSION UPDATE 2026-07-02 — LinkedIn source, cost cut, manual-apply pivot
Big direction change: **LinkedIn is now the MAIN source (via Apify), Hunter dropped, model shifted to high-volume MANUAL APPLY** (no cold emails sent). All pushed to `main`.

**Cost cut — Hunter DROPPED (commit a718dfc):** was ~90% of the bill (~$34–49/mo, flat subscription). Local `.env` `HUNTER_API_KEY` commented, **prod GH secret `HUNTER_API_KEY` deleted**. Empty key ⇒ pipeline skips Hunter. `HUNTER_DAILY_CAP`/`usage` logic now inert. **USER MUST still cancel the Hunter plan on hunter.io** — dropping the key doesn't stop the charge.

**LinkedIn via Apify = MAIN source (commits 4d9f941, 1ac143f):** WHY needed — JSearch = Google-for-Jobs wrapper; LinkedIn deliberately withholds listings from it, so JSearch returns ~0 real LinkedIn (mostly reposter spam: JobHub/JobLeads/liveblog365). Apify actor **`cheap_scraper~linkedin-job-scraper`** (no cookies; keyword+locations+workType). Input: `{keyword:[...], locations:[REAL LinkedIn geos — "Worldwide" invalid], workType:["remote"], publishedAt:r86400|r604800|r2592000}`; **min 150 results/run** (aborts below). Output→`normalize_apify_linkedin` in `sources.py` (source="linkedin"; **location prefixed "Remote - "** so US-remote passes geo). Wired FIRST in `fetch_all`. Cost ~$0.00074/job. **Geo lesson:** query the CANDIDATE'S REGION, not US — US/UK locations return jobs needing local work-auth → scorer geo_blocks them. Set `APIFY_LOCATIONS=Pakistan,United Arab Emirates,India` → geo_blocks fell 58→1–3, applicable LinkedIn drafts rose 6→15. Config in `config.py` + `scrape.yml`: `APIFY_TOKEN` (secret set), `APIFY_ACTOR/KEYWORDS/LOCATIONS/MAX_RESULTS` (200). **Apify acct `endearing_row`, FREE plan ($5 credits ≈ 6750 jobs/mo)**; token `apify_api_4I7h…` was pasted in chat → user may rotate.

**Manual-apply model — no wrong emails (commit 8b703c2):** careers@ guessing produced junk emails (reposter/hosting domains). Added `EMAIL_PATTERN_FALLBACK` (default **off**) in `config.py`; `enrich.finalize_email(use_pattern=...)` skips the careers@ guess ⇒ no email found ⇒ routes to **manual_apply** with draft + real job link. Existing bad emails cleaned in DB (pattern rows → recruiter_email null, dry_run→manual_apply). `has_email=0` verified on a fresh scrape.

**Email persistence + dashboard detail (commits 9eb7c73, dcfb8af):** new `applications.email_body` column (migration applied) + in `VALID_COLUMNS`; pipeline now **drafts for manual_apply too** and stores subject+body on applied/dry_run/manual_apply. New **lead detail drawer** `src/components/LeadRow.tsx` — click a row → portal modal with full email (subject+body) + **Copy** button, scoring, contact, meta, "Open job posting ↗". `email_body` added to `src/lib/types.ts`.

**Volume scaled for manual apply (commit ba24e2f):** `MAX_JOBS_PER_RUN` 30→100, `JSEARCH_NUM_PAGES` 3→10 (**needs JSearch Pro** — free 200/mo would exhaust), `LOOKBACK_HOURS` 168→336. JSearch query also fixed to `remote devops cloud sre platform engineer` (81dc12b — "remote" essential).

**Email copy (commit a8ce463):** removed **"no pressure"** from the CTA — deleted from `settings.email_template` AND added to `_DONT_USE` in `email_writer.py`. **LinkedIn link** already wired: `_signature` includes `settings.candidate_linkedin` (currently EMPTY → user adding it in Settings → Candidate Signature; validates https URL). New drafts pick it up.

**Cost model now:** Apify (LinkedIn) + free boards + JSearch, **no Hunter** ≈ **$7–20/mo**; add JSearch Pro ($25) → ~$32–45/mo. Supabase/Vercel/GitHub free.

**PENDING user actions (2026-07-02):** (1) **cancel Hunter subscription** on hunter.io; (2) **subscribe JSearch Pro** on RapidAPI (NUM_PAGES=10 needs it); (3) **add candidate_linkedin** in Settings; (4) optionally rotate the Apify token; (5) still open from before: upload resume PDF + flip send_emails if/when returning to auto-send (currently manual-apply, so sending is moot). NOTE `send_error` chip + Hunter-today Overview widget reference the now-dropped Hunter — cosmetic, ignore/clean later.

## Working style
Incremental — ONE step per turn, check in between. **Now MANUAL-APPLY mode** (no emails sent; leads = draft + real job link). Was dry-run/send before; sending is currently out of scope.
