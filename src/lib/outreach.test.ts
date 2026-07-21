import { describe, it, expect } from "vitest";
import { validateEnqueue, isValidAppStatus, computeScheduledAt } from "./outreach";

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
