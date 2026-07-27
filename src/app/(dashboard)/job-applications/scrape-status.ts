"use server";

import { supabaseRead } from "@/lib/supabase";
import type { ScrapeProgress } from "@/lib/scrape";

/**
 * Has a scrape finished since `sinceIso`?
 *
 * A scrape runs on GitHub Actions and takes minutes, so the dispatch response
 * tells us nothing about the result. The client polls this until a run lands,
 * then refreshes the page and notifies — which is why new leads used to never
 * appear without a manual reload.
 */
export async function getScrapeProgress(sinceIso: string): Promise<ScrapeProgress> {
  const sb = supabaseRead();

  const [{ data: runRows }, leadCount] = await Promise.all([
    sb.from("scrape_runs")
      .select("finished_at,total_scraped,qualified")
      .gt("finished_at", sinceIso)
      .order("finished_at", { ascending: false })
      .limit(1),
    sb.from("applications").select("job_id", { count: "exact", head: true }),
  ]);

  const run = runRows?.[0] as
    | { finished_at: string; total_scraped: number; qualified: number }
    | undefined;

  return {
    done: Boolean(run),
    finishedAt: run?.finished_at ?? null,
    totalScraped: run?.total_scraped ?? 0,
    qualified: run?.qualified ?? 0,
    leadCount: leadCount.count ?? 0,
  };
}
