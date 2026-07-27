import { describe, it, expect } from "vitest";
import { validateEnqueue, isValidAppStatus, computeScheduledAt, followupUnlocked } from "./outreach";

describe("validateEnqueue", () => {
  it("rejects a missing recipient", () => {
    expect(validateEnqueue({ to: "", subject: "s", body: "b" }).ok).toBe(false);
  });
  it("rejects a malformed recipient", () => {
    expect(validateEnqueue({ to: "not-an-email", subject: "s", body: "b" }).ok).toBe(false);
  });
  it("rejects empty subject or body", () => {
    expect(validateEnqueue({ to: "a@b.com", subject: "  ", body: "b" }).ok).toBe(false);
    expect(validateEnqueue({ to: "a@b.com", subject: "s", body: "  " }).ok).toBe(false);
  });
  it("accepts a valid review", () => {
    expect(validateEnqueue({ to: "a@b.com", subject: "s", body: "b" }).ok).toBe(true);
  });
});

describe("isValidAppStatus", () => {
  it("accepts the canonical set and rejects others", () => {
    expect(isValidAppStatus("applied")).toBe(true);
    expect(isValidAppStatus("remaining")).toBe(true);
    expect(isValidAppStatus("bogus")).toBe(false);
  });
});

describe("computeScheduledAt", () => {
  const now = 1_000_000_000_000;

  it("schedules an empty queue for now", () => {
    expect(computeScheduledAt(now, null).getTime()).toBe(now);
  });

  it("spaces from the queue tail by min..max minutes", () => {
    const tail = now + 60_000; // 1 min in the future
    const atMin = computeScheduledAt(now, tail, 8, 10, 0).getTime();
    const atMax = computeScheduledAt(now, tail, 8, 10, 0.999999).getTime();
    expect(atMin).toBe(tail + 8 * 60_000);
    expect(atMax).toBeGreaterThan(tail + 9.99 * 60_000);
    expect(atMax).toBeLessThanOrEqual(tail + 10 * 60_000);
  });

  it("uses now as the base when the tail is in the past", () => {
    const tail = now - 60_000;
    const at = computeScheduledAt(now, tail, 8, 10, 0).getTime();
    expect(at).toBe(now + 8 * 60_000);
  });
});

// ---------------------------------------------------------------------------
// followupUnlocked — the 24h gate, enforced on BOTH the button and the server
// ---------------------------------------------------------------------------
describe("followupUnlocked", () => {
  const sentAt = "2026-07-28T00:00:00.000Z";
  const sentMs = Date.parse(sentAt);
  const base = { sentAt, replyReceived: false, followupSent: false };

  it("stays locked before 24h and says how long is left", () => {
    const r = followupUnlocked(base, sentMs + 5 * 3_600_000);   // 5h in
    expect(r.ok).toBe(false);
    expect(r.message).toContain("19h");
  });

  it("unlocks exactly at 24h", () => {
    expect(followupUnlocked(base, sentMs + 24 * 3_600_000).ok).toBe(true);
  });

  it("stays locked once they replied, however long it has been", () => {
    const r = followupUnlocked({ ...base, replyReceived: true }, sentMs + 10 * 86_400_000);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("replied");
  });

  it("never allows a second follow-up", () => {
    const r = followupUnlocked({ ...base, followupSent: true }, sentMs + 10 * 86_400_000);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("already been sent");
  });

  it("is locked when no email was actually sent (e.g. only Mark-applied)", () => {
    expect(followupUnlocked({ ...base, sentAt: null }, sentMs).ok).toBe(false);
    expect(followupUnlocked({ ...base, sentAt: "not-a-date" }, sentMs).ok).toBe(false);
  });
});
