// Shared types + constants for the manual scrape flow. Kept out of the
// "use server" action modules, which may only export async functions.
//
// The scrape button has no cooldown/lock — every click dispatches a fresh
// JSearch + Apify scrape on GitHub Actions.

export interface ScrapeState {
  ok: boolean;
  message: string;
}

/** Result of polling for a finished scrape (see scrape-status.ts). */
export interface ScrapeProgress {
  done: boolean;
  finishedAt: string | null;
  totalScraped: number;
  qualified: number;
  leadCount: number;
}

// A scrape runs on GitHub Actions, so the dashboard has to watch for the
// result rather than being told. The watcher lives in the dashboard layout and
// survives navigation by keeping the in-flight marker in localStorage.
export const SCRAPE_WATCH_KEY = "onecrew:scrape-started-at";
export const SCRAPE_POLL_MS = 15_000;
// Give up watching after this long — a stuck or failed Actions run should not
// leave the UI polling forever.
export const SCRAPE_WATCH_TIMEOUT_MS = 30 * 60_000;
