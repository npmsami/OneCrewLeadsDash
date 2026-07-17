"use server";

import { revalidatePath } from "next/cache";
import type { ScrapeState } from "@/lib/scrape";

const REPO = "npmsami/OneCrewLeadsDash";
const WORKFLOW = "scrape.yml"; // dispatch by filename (stabler than the numeric id)

// Fires the GitHub Actions scrape workflow (JSearch + Apify discovery). No
// cooldown/lock — every click starts a fresh scrape.
export async function triggerScrapeAction(): Promise<ScrapeState> {
  // Need a token with Actions: write on the repo.
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, message: "Server is missing GITHUB_DISPATCH_TOKEN." };
  }

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
    return { ok: false, message: `GitHub dispatch failed (${res.status}). ${detail}` };
  }

  revalidatePath("/job-applications");
  return {
    ok: true,
    message: "Scrape started — leads will appear here in a few minutes.",
  };
}
