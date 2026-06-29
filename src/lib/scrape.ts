// Shared constants + types for the manual scrape flow. Kept out of the
// "use server" action module, which may only export async functions.

// One manual scrape per 24h (the button lock, enforced server-side).
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Mirrors HUNTER_DAILY_CAP in .github/workflows/scrape.yml.
export const HUNTER_DAILY_CAP = 15;

export interface ScrapeState {
  ok: boolean;
  message: string;
  lockedUntil: string | null; // ISO; when the button unlocks again
}
