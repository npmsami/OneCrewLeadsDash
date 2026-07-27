"use server";

import { revalidatePath } from "next/cache";
import type { ScrapeState } from "@/lib/scrape";

const REPO = "npmsami/OneCrewLeadsDash";
const WORKFLOW = "enrich.yml"; // dispatch by filename (stabler than the numeric id)

/**
 * Fires the GitHub Actions re-enrich workflow: Hunter (searched by company
 * name, so board-hosted leads resolve) over leads that have no
 * recruiter email yet. Leads that get one are re-addressed and move from
 * manual_apply to dry_run, ready to review + Apply.
 *
 * Pass a jobId to look up one specific lead instead of the whole backlog.
 * Spend is bounded server-side by the daily/monthly Hunter caps, so a
 * trigger-happy click can't drain the plan.
 */
export async function triggerEnrichAction(jobId?: string): Promise<ScrapeState> {
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
      body: JSON.stringify({
        ref: "main",
        inputs: { reason: jobId ? "dashboard lead" : "dashboard button", job_id: jobId ?? "" },
      }),
    },
  );
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => "")).slice(0, 160);
    return { ok: false, message: `GitHub dispatch failed (${res.status}). ${detail}` };
  }

  revalidatePath("/job-applications");
  revalidatePath("/job-applications/leads");
  if (jobId) revalidatePath(`/job-applications/leads/${encodeURIComponent(jobId)}`);

  return {
    ok: true,
    message: jobId
      ? "Looking up this company — refresh in a minute to see the contact."
      : "Email lookup started — recipients will appear on leads in a few minutes.",
  };
}
