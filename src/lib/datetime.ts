// One source of truth for how this hub renders dates and times.
//
// Everything is shown in Pakistan time regardless of where the code runs. That
// matters because these helpers execute in three places with three different
// clocks: the browser (your machine, PKT), the Vercel server rendering the same
// component (UTC), and GitHub Actions (UTC). Leaving the timezone to the
// runtime meant a lead scraped at 10:39 PM read as 5:39 PM once deployed, and
// server and client could disagree mid-hydration.
//
// The locale is pinned for the same reason: `undefined` resolves to whatever
// the runtime prefers, so the server could render "29 Jul" while the browser
// rendered "Jul 29" and React would flag a hydration mismatch.

export const APP_TIME_ZONE = "Asia/Karachi";
export const APP_TIME_ZONE_LABEL = "PKT";

// Pakistan sits at UTC+5 year-round — no daylight saving since the 2009
// experiment was dropped — so a fixed offset is safe for query bounds, where a
// real timezone name isn't accepted.
export const APP_UTC_OFFSET = "+05:00";

const LOCALE = "en-US";

const DATE_TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE, month: "short", day: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit",
});
// en-CA renders ISO-style YYYY-MM-DD, which is what <input type="date"> wants.
const YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Parse an ISO string, returning null rather than an Invalid Date that would
 *  make Intl throw a RangeError deep inside a render. */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Jul 29" */
export function fmtDate(iso: string | null): string {
  const d = parse(iso);
  return d ? DATE_FMT.format(d) : "—";
}

/** "10:39 PM" — empty (not a dash) so it can sit under a date without noise. */
export function fmtTime(iso: string | null): string {
  const d = parse(iso);
  return d ? TIME_FMT.format(d) : "";
}

/** "Jul 29, 10:39 PM" */
export function fmtDateTime(iso: string | null): string {
  const d = parse(iso);
  return d ? DATE_TIME_FMT.format(d) : "—";
}

/** "just now" / "42m ago" / "3h ago" / "2d ago". Relative, so the timezone
 *  never enters into it — but it belongs beside the others. */
export function timeAgo(iso: string | null): string {
  const d = parse(iso);
  if (!d) return "—";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Today's date on the Pakistan calendar, as YYYY-MM-DD. */
export function appToday(): string {
  return ymdInAppTz(new Date());
}

/** `days` before today on the Pakistan calendar, as YYYY-MM-DD. */
export function appDaysAgo(days: number): string {
  const [y, m, d] = appToday().split("-").map(Number);
  // Anchor at UTC noon: far enough from either midnight that subtracting whole
  // days can't slip across the +05:00 offset and land on the wrong date.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}

function ymdInAppTz(date: Date): string {
  const parts = YMD_FMT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First instant of a Pakistan calendar day, as an ISO timestamp for Postgres. */
export function dayStartIso(ymd: string): string {
  return `${ymd}T00:00:00.000${APP_UTC_OFFSET}`;
}

/** Last instant of a Pakistan calendar day (inclusive upper bound). */
export function dayEndIso(ymd: string): string {
  return `${ymd}T23:59:59.999${APP_UTC_OFFSET}`;
}
