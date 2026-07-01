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
  notes: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface Settings {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_linkedin: string;
  resume_url: string;
  resume_filename: string;
  send_emails: boolean;
  email_template: string;
  followup_template: string;
  updated_at: string;
}
