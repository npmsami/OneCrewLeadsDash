import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fmtDate, fmtTime, fmtDateTime, timeAgo,
  appToday, appDaysAgo, dayStartIso, dayEndIso,
  APP_TIME_ZONE, APP_UTC_OFFSET,
} from "./datetime";

// The whole point of this module is that output does NOT depend on where it
// runs, so every assertion here is an absolute expectation, not a
// recomputation. These would fail if the formatters fell back to the runtime
// timezone — the machine running the tests is not guaranteed to be in Karachi,
// and CI is UTC.

afterEach(() => vi.useRealTimers());

describe("formatting is pinned to Pakistan time", () => {
  // 2026-07-29T17:39:01Z is 10:39 PM the same day in Karachi (UTC+5).
  const iso = "2026-07-29T17:39:01.000Z";

  it("uses the Pakistan clock, not the runtime's", () => {
    expect(fmtDate(iso)).toBe("Jul 29");
    expect(fmtTime(iso)).toBe("10:39 PM");
    expect(fmtDateTime(iso)).toBe("Jul 29, 10:39 PM");
  });

  it("rolls to the next Pakistan day for late-UTC timestamps", () => {
    // 21:00 UTC on the 28th is already 2 AM on the 29th in Karachi.
    expect(fmtDate("2026-07-28T21:00:00.000Z")).toBe("Jul 29");
    expect(fmtTime("2026-07-28T21:00:00.000Z")).toBe("2:00 AM");
  });

  it("keeps the previous Pakistan day for early-UTC timestamps", () => {
    // 18:00 UTC on the 29th is 11 PM the same day — not yet the 30th.
    expect(fmtDate("2026-07-29T18:00:00.000Z")).toBe("Jul 29");
  });

  it("survives null and unparseable input instead of throwing", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDateTime("not-a-date")).toBe("—");
    expect(fmtTime(null)).toBe("");
    expect(timeAgo("nonsense")).toBe("—");
  });
});

describe("timeAgo", () => {
  it("describes the distance from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    expect(timeAgo("2026-07-29T11:59:30.000Z")).toBe("just now");
    expect(timeAgo("2026-07-29T11:20:00.000Z")).toBe("40m ago");
    expect(timeAgo("2026-07-29T09:00:00.000Z")).toBe("3h ago");
    expect(timeAgo("2026-07-27T12:00:00.000Z")).toBe("2d ago");
  });
});

describe("Pakistan calendar days", () => {
  it("reports today on the Pakistan calendar, not UTC's", () => {
    vi.useFakeTimers();
    // 22:30 UTC on the 29th is already 3:30 AM on the 30th in Karachi.
    vi.setSystemTime(new Date("2026-07-29T22:30:00.000Z"));
    expect(appToday()).toBe("2026-07-30");
    expect(appDaysAgo(0)).toBe("2026-07-30");
  });

  it("counts back whole days without slipping across the offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
    expect(appDaysAgo(6)).toBe("2026-07-23");
    expect(appDaysAgo(29)).toBe("2026-06-30"); // crosses a month boundary
  });
});

describe("query bounds", () => {
  it("brackets a Pakistan day with an explicit offset", () => {
    expect(dayStartIso("2026-07-29")).toBe("2026-07-29T00:00:00.000+05:00");
    expect(dayEndIso("2026-07-29")).toBe("2026-07-29T23:59:59.999+05:00");
  });

  it("produces bounds Postgres reads as the intended UTC instants", () => {
    // The start of Jul 29 in Karachi is 19:00 UTC on Jul 28.
    expect(new Date(dayStartIso("2026-07-29")).toISOString()).toBe("2026-07-28T19:00:00.000Z");
    expect(new Date(dayEndIso("2026-07-29")).toISOString()).toBe("2026-07-29T18:59:59.999Z");
  });

  it("names the zone and offset consistently", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Karachi");
    expect(APP_UTC_OFFSET).toBe("+05:00");
  });
});
