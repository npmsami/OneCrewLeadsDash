// Shapes mirror supabase/schema.sql (the agent's `applications` table + views).

export type LeadStatus =
  | "new"
  | "scored"
  | "enriched"
  | "applied"
  | "followed_up"
  | "replied"
  | "closed"
  | "geo_blocked"
  | "low_match"
  | "score_error"
  | "manual_apply"
  | "dry_run";

// User-facing application lifecycle (migration 0002), driven from the dashboard.
// Distinct from the pipeline `status` above (which tracks scoring/enrichment).
export type AppStatus = "remaining" | "queued" | "applied" | "done" | "failed";
export const APP_STATUSES: AppStatus[] = ["remaining", "queued", "applied", "done", "failed"];

// Queue-item lifecycle for the outreach send pipeline.
export type QueueStatus = "ready" | "queued" | "sending" | "sent" | "failed" | "canceled";

export interface Application {
  job_id: string;
  job_title: string | null;
  company: string | null;
  matched_track: string | null;
  source: string | null;
  job_url: string | null;
  posted_date: string | null;
  scraped_at: string | null;
  match_score: number | null;
  geo_eligible: boolean | null;
  geo_reason: string | null;
  seniority_match: string | null;
  matched_keywords: string | null;
  missing_keywords: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  email_confidence: string | null;
  email_source: string | null;
  resume_filename: string | null;
  resume_drive_link: string | null;
  email_subject: string | null;
  email_body: string | null;
  applied_at: string | null;
  reply_received: boolean;
  reply_date: string | null;
  followup_sent: boolean;
  followup_date: string | null;
  status: LeadStatus | string;
  app_status: AppStatus | string;
  qualified: boolean | null;
  publisher: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachQueue {
  id: string;
  job_id: string;
  to_email: string;
  subject: string | null;
  body: string | null;
  resume_id: string | null;
  status: QueueStatus | string;
  scheduled_at: string;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Resume {
  id: string;
  filename: string;
  storage_path: string;
  mime: string;
  size_bytes: number | null;
  is_default: boolean;
  uploaded_at: string;
}

export interface ScrapeRun {
  id: string;
  started_at: string | null;
  finished_at: string;
  total_scraped: number;
  qualified: number;
  unqualified: number;
  duplicates_skipped: number;
  source_breakdown: Record<string, number> | null;
  status: string;
}

export interface ApplicationStats {
  total: number;
  applied: number;
  followed_up: number;
  replied: number;
  dry_run: number;
  filtered_out: number;
  avg_score: number | null;
  last_scraped_at: string | null;
  last_applied_at: string | null;
  // app_status buckets (migration 0002)
  remaining: number;
  queued: number;
  app_applied: number;
  done: number;
  failed: number;
  qualified: number;
  unqualified: number;
}

export interface Settings {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_linkedin: string;
  resume_url: string;
  resume_filename: string;
  default_resume_id: string | null;
  daily_send_cap: number;
  send_emails: boolean;
  email_template: string;
  followup_template: string;
  updated_at: string;
}
