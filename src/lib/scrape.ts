// Shared types for the manual scrape flow. Kept out of the "use server" action
// module, which may only export async functions.
//
// The scrape button has no cooldown/lock and no Hunter counter anymore — every
// click dispatches a fresh JSearch + Apify scrape.

export interface ScrapeState {
  ok: boolean;
  message: string;
}
