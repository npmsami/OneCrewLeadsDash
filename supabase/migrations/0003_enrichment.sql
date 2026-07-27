-- 0003 — enrichment: persist what the provider resolved, and let the dashboard
-- see/act on it.
--
-- Why: leads sourced from LinkedIn carry a linkedin.com job_url, so the agent
-- had no company domain to look up and every lead fell through to manual_apply
-- with no recruiter email. Enrichment now searches Hunter/Apollo by company
-- NAME and resolves the domain server-side — worth persisting so a re-enrich
-- pass (and the UI) can reuse it instead of paying for the lookup again.

alter table public.applications
  add column if not exists company_domain  text,   -- resolved by Hunter/Apollo
  add column if not exists recruiter_title text,   -- e.g. "Technical Recruiter"
  add column if not exists enriched_at     timestamptz;  -- last enrichment attempt

-- Backlog query for the re-enrich worker: qualified leads that still have no
-- recruiter email, best match first, never-tried before already-tried.
create index if not exists applications_enrich_backlog_idx
  on public.applications (match_score desc nulls last, enriched_at nulls first)
  where recruiter_email is null;

comment on column public.applications.company_domain is
  'Company domain resolved during enrichment (Hunter/Apollo), not the job board host.';
comment on column public.applications.recruiter_title is
  'Job title of the matched contact — shown in the review screen so the user can judge the recipient.';
comment on column public.applications.enriched_at is
  'Timestamp of the last enrichment attempt (success or miss). NULL = never attempted.';
