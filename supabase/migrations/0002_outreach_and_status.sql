-- ============================================================================
-- 0002 — Human-gated outreach: per-lead app_status, multi-resume, outreach
--        queue, and scrape-run stats.
--
-- Additive + backfill only (safe on the live `applications` table). Writes go
-- through the service role (bypasses RLS); the dashboard reads with anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) applications — user-facing status, qualification flag, source publisher
-- ---------------------------------------------------------------------------
-- `status` stays the pipeline lifecycle (scoring/enrichment). `app_status` is
-- the human apply-flow the dashboard drives: remaining -> queued -> applied /
-- done / failed. Kept separate so scraping never clobbers a user's decision.
alter table public.applications
  add column if not exists app_status text not null default 'remaining',
  add column if not exists qualified  boolean,
  add column if not exists publisher  text;

-- Backfill app_status from the pipeline status (only genuine applies carry over).
update public.applications set app_status = 'applied' where status = 'applied';

-- Backfill qualified: passed the score/geo gate = qualified; new = not yet known.
update public.applications set qualified =
  case
    when status in ('geo_blocked', 'low_match', 'score_error') then false
    when status = 'new'                                         then null
    else true
  end;

create index if not exists idx_applications_app_status on public.applications (app_status);

-- ---------------------------------------------------------------------------
-- 2) resumes — multiple stored resumes (PDF/DOCX), one default
-- ---------------------------------------------------------------------------
-- Files live in the PRIVATE `resumes` storage bucket at resumes/<id>.<ext>;
-- storage_path is the object key, never a public URL.
create table if not exists public.resumes (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  storage_path text not null,
  mime         text not null,                 -- application/pdf | ...wordprocessingml.document
  size_bytes   integer,
  is_default   boolean not null default false,
  uploaded_at  timestamptz not null default now()
);
-- At most one default resume.
create unique index if not exists uniq_resumes_default on public.resumes (is_default) where is_default;

-- settings: point at the default resume + hold the daily send cap (provider limit).
alter table public.settings
  add column if not exists default_resume_id uuid references public.resumes(id) on delete set null,
  add column if not exists daily_send_cap    smallint not null default 40;

-- Migrate the legacy single-resume pointer into a resumes row (once).
insert into public.resumes (filename, storage_path, mime, is_default)
select coalesce(nullif(resume_filename, ''), 'Resume.pdf'), resume_url, 'application/pdf', true
from public.settings
where id = 'singleton'
  and coalesce(resume_url, '') <> ''
  and not exists (select 1 from public.resumes);

update public.settings s set default_resume_id = r.id
from public.resumes r
where s.id = 'singleton' and s.default_resume_id is null and r.is_default;

-- ---------------------------------------------------------------------------
-- 3) outreach_queue — the review -> send pipeline (holds the EDITED email)
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_queue (
  id                  uuid primary key default gen_random_uuid(),
  job_id              text not null references public.applications(job_id) on delete cascade,
  to_email            text not null,
  subject             text,
  body                text,
  resume_id           uuid references public.resumes(id) on delete set null,
  status              text not null default 'queued',   -- ready|queued|sending|sent|failed|canceled
  scheduled_at        timestamptz not null default now(),
  attempts            integer not null default 0,
  last_error          text,
  provider_message_id text,                              -- Gmail id -> idempotency
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_outreach_status_sched on public.outreach_queue (status, scheduled_at);

-- Duplicate-send guard: one ACTIVE (or sent) queue entry per lead. A failed or
-- canceled row does NOT block, so retry reuses/re-queues that same lead safely.
create unique index if not exists uniq_outreach_active_job
  on public.outreach_queue (job_id)
  where status in ('ready', 'queued', 'sending', 'sent');

drop trigger if exists trg_outreach_updated_at on public.outreach_queue;
create trigger trg_outreach_updated_at
  before update on public.outreach_queue
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) scrape_runs — one summary row per scrape, for the Overview stats panel
-- ---------------------------------------------------------------------------
create table if not exists public.scrape_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz,
  finished_at        timestamptz not null default now(),
  total_scraped      integer not null default 0,   -- fresh rows written this run
  qualified          integer not null default 0,
  unqualified        integer not null default 0,
  duplicates_skipped integer not null default 0,    -- discovered but already stored
  source_breakdown   jsonb,
  status             text not null default 'complete'
);
create index if not exists idx_scrape_runs_finished on public.scrape_runs (finished_at desc);

-- ---------------------------------------------------------------------------
-- 5) RLS — read-permissive (internal tool); all writes via service role
-- ---------------------------------------------------------------------------
alter table public.resumes        enable row level security;
alter table public.outreach_queue enable row level security;
alter table public.scrape_runs    enable row level security;

drop policy if exists "read resumes" on public.resumes;
create policy "read resumes" on public.resumes for select using (true);

drop policy if exists "read outreach_queue" on public.outreach_queue;
create policy "read outreach_queue" on public.outreach_queue for select using (true);

drop policy if exists "read scrape_runs" on public.scrape_runs;
create policy "read scrape_runs" on public.scrape_runs for select using (true);

-- ---------------------------------------------------------------------------
-- 6) application_stats — extend with app_status buckets + qualified counts
-- ---------------------------------------------------------------------------
create or replace view public.application_stats as
select
  count(*)                                                                      as total,
  count(*) filter (where status = 'applied')                                   as applied,
  count(*) filter (where status = 'followed_up')                               as followed_up,
  count(*) filter (where reply_received)                                        as replied,
  count(*) filter (where status = 'dry_run')                                    as dry_run,
  count(*) filter (where status in ('geo_blocked','low_match','score_error','manual_apply')) as filtered_out,
  round(avg(match_score) filter (where match_score is not null))::int           as avg_score,
  max(scraped_at)                                                               as last_scraped_at,
  max(applied_at)                                                               as last_applied_at,
  -- app_status buckets (the human apply flow)
  count(*) filter (where app_status = 'remaining')                             as remaining,
  count(*) filter (where app_status = 'queued')                                as queued,
  count(*) filter (where app_status = 'applied')                               as app_applied,
  count(*) filter (where app_status = 'done')                                  as done,
  count(*) filter (where app_status = 'failed')                                as failed,
  count(*) filter (where qualified is true)                                     as qualified,
  count(*) filter (where qualified is false)                                    as unqualified
from public.applications;
