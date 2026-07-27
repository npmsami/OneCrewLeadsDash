-- 0004 — persist the job description.
--
-- Why: the email writer grounds every claim in the JD text (strict grounding
-- rules in email_writer.build_email_prompt), but the description was only ever
-- held in memory during a scrape and never stored. That made it impossible to
-- re-draft an email later — e.g. after a re-enrich pass finally finds a real
-- recruiter, or when the user asks for a regenerated draft from the dashboard.
-- Storing it also lets the review screen show the JD next to the email.
--
-- Truncated to 20k chars on write (agent side) — the writer only reads 4k and
-- the scorer 7k, so this is generous headroom without bloating the table.

alter table public.applications
  add column if not exists job_description text;

comment on column public.applications.job_description is
  'Raw job description text from the source. Grounding input for email drafting and re-drafting.';
