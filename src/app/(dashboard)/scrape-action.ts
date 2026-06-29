"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { COOLDOWN_MS, type ScrapeState } from "@/lib/scrape";

// The lock is enforced HERE (server-authoritative), not just by the disabled
// button — a stale or forged client can't bypass it.
const REPO = "npmsami/OneCrewLeadsDash";
const WORKFLOW = "scrape.yml"; // dispatch by filename (stabler than the numeric id)

export async function triggerScrapeAction(): Promise<ScrapeState> {
  const admin = supabaseAdmin();

  // 1. Cooldown check (authoritative).
  const { data: rs } = await admin
    .from("run_state").select("last_scrape_at").eq("id", "singleton").maybeSingle();
  const last = rs?.last_scrape_at ? new Date(rs.last_scrape_at).getTime() : 0;
  const now = Date.now();
  if (last && now - last < COOLDOWN_MS) {
    return {
      ok: false,
      message: "Already scraped in the last 24h. One run per day.",
      lockedUntil: new Date(last + COOLDOWN_MS).toISOString(),
    };
  }

  // 2. Need a token with Actions: write on the repo.
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, message: "Server is missing GITHUB_DISPATCH_TOKEN.", lockedUntil: null };
  }

  // 3. Fire the GitHub Actions scrape workflow.
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { reason: "dashboard button" } }),
    },
  );
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => "")).slice(0, 160);
    return { ok: false, message: `GitHub dispatch failed (${res.status}). ${detail}`, lockedUntil: null };
  }

  // 4. Start the 24h lock.
  await admin
    .from("run_state")
    .upsert({ id: "singleton", last_scrape_at: new Date(now).toISOString() }, { onConflict: "id" });

  revalidatePath("/");
  return {
    ok: true,
    message: "Scrape started — leads will appear here in a few minutes.",
    lockedUntil: new Date(now + COOLDOWN_MS).toISOString(),
  };
}
