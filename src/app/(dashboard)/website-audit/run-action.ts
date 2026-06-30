"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { AUDIT_COOLDOWN_MS, type AuditRunState } from "@/lib/audit";

const REPO = "npmsami/OneCrewLeadsDash";
const WORKFLOW = "audit.yml";

// Dispatches the Website-audit GitHub Actions batch. Authoritative run-lock via
// audit_settings.last_run_at so two overlapping batches can't double-send leads.
export async function triggerAuditRunAction(): Promise<AuditRunState> {
  const admin = supabaseAdmin();

  const { data: s } = await admin
    .from("audit_settings").select("last_run_at").eq("id", "singleton").maybeSingle();
  const last = s?.last_run_at ? new Date(s.last_run_at).getTime() : 0;
  const now = Date.now();
  if (last && now - last < AUDIT_COOLDOWN_MS) {
    return {
      ok: false,
      message: "A batch is already running. Wait for it to finish before starting another.",
      lockedUntil: new Date(last + AUDIT_COOLDOWN_MS).toISOString(),
    };
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, message: "Server is missing GITHUB_DISPATCH_TOKEN.", lockedUntil: null };
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
      body: JSON.stringify({ ref: "main", inputs: { reason: "dashboard run" } }),
    },
  );
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => "")).slice(0, 160);
    return { ok: false, message: `GitHub dispatch failed (${res.status}). ${detail}`, lockedUntil: null };
  }

  await admin
    .from("audit_settings")
    .update({ last_run_at: new Date(now).toISOString() })
    .eq("id", "singleton");

  revalidatePath("/website-audit");
  return {
    ok: true,
    message: "Outreach batch started — leads will move to Sent over the next ~15 minutes.",
    lockedUntil: new Date(now + AUDIT_COOLDOWN_MS).toISOString(),
  };
}
