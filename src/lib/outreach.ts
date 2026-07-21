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
