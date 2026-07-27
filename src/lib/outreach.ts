// Pure, testable helpers for the outreach queue (no Supabase import).
import { APP_STATUSES, type AppStatus } from "./types";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface EnqueueInput {
  to: string;
  subject: string;
  body: string;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

/** Validate an editable-email review before it can be queued. */
export function validateEnqueue(input: EnqueueInput): ValidationResult {
  const to = input.to.trim();
  if (!to) return { ok: false, message: "Add a recipient email address." };
  if (!EMAIL_RE.test(to)) return { ok: false, message: "Recipient must be a valid email address." };
  if (!input.subject.trim()) return { ok: false, message: "Subject can't be empty." };
  if (!input.body.trim()) return { ok: false, message: "Email body can't be empty." };
  return { ok: true, message: "" };
}

export function isValidAppStatus(s: string): s is AppStatus {
  return (APP_STATUSES as string[]).includes(s);
}

/**
 * When should the next queued email be eligible to send? Spacing is measured
 * from the current tail of the queue so consecutive emails land ~min..max
 * minutes apart; an empty queue sends on the next worker tick.
 *
 * @param nowMs   current time (ms)
 * @param tailMs  scheduled_at of the latest active queue item (ms), or null
 * @param minMin  minimum gap in minutes (default 8)
 * @param maxMin  maximum gap in minutes (default 10)
 * @param rand    a value in [0,1) (injected for deterministic tests)
 */
export function computeScheduledAt(
  nowMs: number,
  tailMs: number | null,
  minMin = 8,
  maxMin = 10,
  rand = Math.random(),
): Date {
  if (tailMs == null) return new Date(nowMs);
  const base = Math.max(nowMs, tailMs);
  const gapMs = (minMin + rand * Math.max(0, maxMin - minMin)) * 60_000;
  return new Date(base + gapMs);
}

// ---------------------------------------------------------------------------
// Follow-up gate
// ---------------------------------------------------------------------------
/** A follow-up unlocks 24h after the first email, if nobody replied. */
export const FOLLOWUP_AFTER_MS = 24 * 60 * 60 * 1000;

export interface FollowupGateInput {
  /** When the FIRST email actually went out (outreach_queue.sent_at).
   *  Deliberately not applications.applied_at — that is also stamped by the
   *  manual "Mark applied" button, which would unlock a follow-up for a lead
   *  no email was ever sent to. sent_email_stats anchors on the same column. */
  sentAt: string | null;
  replyReceived: boolean | null;
  followupSent: boolean | null;
}

/**
 * Whether "Send follow-up" is allowed for a lead, and why not if it isn't.
 *
 * Shared by the UI (to disable the button and explain the wait) and the server
 * action (to enforce it) — a disabled button is not a guarantee, so the same
 * rule runs on both sides.
 */
export function followupUnlocked(
  lead: FollowupGateInput,
  nowMs: number,
): { ok: boolean; message: string; unlocksAtMs?: number } {
  if (lead.replyReceived) {
    return { ok: false, message: "They already replied — no follow-up needed." };
  }
  if (lead.followupSent) {
    return { ok: false, message: "A follow-up has already been sent." };
  }
  if (!lead.sentAt) {
    return { ok: false, message: "This email hasn't been sent yet." };
  }
  const unlocksAtMs = new Date(lead.sentAt).getTime() + FOLLOWUP_AFTER_MS;
  if (Number.isNaN(unlocksAtMs)) {
    return { ok: false, message: "This email hasn't been sent yet." };
  }
  if (nowMs < unlocksAtMs) {
    const hours = Math.max(1, Math.ceil((unlocksAtMs - nowMs) / 3_600_000));
    return { ok: false, message: `Unlocks in ${hours}h (24h after sending).`, unlocksAtMs };
  }
  return { ok: true, message: "", unlocksAtMs };
}
