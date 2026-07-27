"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { validateEnqueue, isValidAppStatus, computeScheduledAt, followupUnlocked } from "@/lib/outreach";

export interface ActionState {
  ok: boolean;
  message: string;
}

// Revalidate every surface that shows a lead's status so Leads, the detail
// page, and Recent Activity stay in sync off the one canonical row.
function revalidateLead(jobId: string) {
  revalidatePath("/job-applications");
  revalidatePath("/job-applications/leads");
  revalidatePath("/job-applications/linkedin");
  revalidatePath("/job-applications/outreach");
  revalidatePath("/job-applications/sent");
  revalidatePath(`/job-applications/leads/${jobId}`);
}

// --- Manual status change (Mark Applied button + status dropdown) -----------
export async function setAppStatusAction(jobId: string, status: string): Promise<ActionState> {
  if (!jobId) return { ok: false, message: "Missing lead id." };
  if (!isValidAppStatus(status)) return { ok: false, message: "Unknown status." };

  const patch: Record<string, unknown> = { app_status: status };
  // Stamp applied_at when the user marks it applied and it isn't set yet.
  if (status === "applied") patch.applied_at = new Date().toISOString();

  try {
    const { error } = await supabaseAdmin().from("applications").update(patch).eq("job_id", jobId);
    if (error) return { ok: false, message: error.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to update status." };
  }
  revalidateLead(jobId);
  return { ok: true, message: `Marked ${status}.` };
}

// --- Enqueue a reviewed email (the "Apply" button) --------------------------
export async function enqueueOutreachAction(
  jobId: string,
  input: { to: string; subject: string; body: string; resumeId?: string | null },
): Promise<ActionState> {
  if (!jobId) return { ok: false, message: "Missing lead id." };
  const valid = validateEnqueue(input);
  if (!valid.ok) return valid;

  const sb = supabaseAdmin();
  try {
    // Space this send from the current tail of the active queue.
    const { data: tailRows } = await sb
      .from("outreach_queue")
      .select("scheduled_at")
      .in("status", ["ready", "queued", "sending"])
      .order("scheduled_at", { ascending: false })
      .limit(1);
    const tailMs = tailRows?.[0]?.scheduled_at ? new Date(tailRows[0].scheduled_at).getTime() : null;
    const scheduledAt = computeScheduledAt(Date.now(), tailMs).toISOString();

    const { error: insErr } = await sb.from("outreach_queue").insert({
      job_id: jobId,
      to_email: input.to.trim(),
      subject: input.subject,
      body: input.body,
      resume_id: input.resumeId || null,
      kind: "initial",
      status: "queued",
      scheduled_at: scheduledAt,
    });
    if (insErr) {
      // Partial unique index (one active row per job) -> already queued/sent.
      if (insErr.code === "23505") {
        return { ok: false, message: "This lead is already queued or has been sent." };
      }
      return { ok: false, message: insErr.message };
    }

    const { error: updErr } = await sb
      .from("applications")
      .update({ app_status: "queued" })
      .eq("job_id", jobId);
    if (updErr) return { ok: false, message: updErr.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to queue email." };
  }

  revalidateLead(jobId);
  return { ok: true, message: "Queued — it will send in a few minutes." };
}

// --- Cancel a still-queued email --------------------------------------------
export async function cancelOutreachAction(queueId: string, jobId: string): Promise<ActionState> {
  if (!queueId) return { ok: false, message: "Missing queue id." };
  const sb = supabaseAdmin();
  try {
    // Only cancellable while still 'queued' (never mid-send / after send).
    const { data, error } = await sb
      .from("outreach_queue")
      .update({ status: "canceled" })
      .eq("id", queueId)
      .eq("status", "queued")
      .select("id");
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) {
      return { ok: false, message: "Too late to cancel — it's already sending or sent." };
    }
    await sb.from("applications").update({ app_status: "remaining" }).eq("job_id", jobId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to cancel." };
  }
  revalidateLead(jobId);
  return { ok: true, message: "Canceled." };
}

// --- Retry a failed email ---------------------------------------------------
export async function retryOutreachAction(queueId: string, jobId: string): Promise<ActionState> {
  if (!queueId) return { ok: false, message: "Missing queue id." };
  const sb = supabaseAdmin();
  try {
    const { data, error } = await sb
      .from("outreach_queue")
      .update({ status: "queued", scheduled_at: new Date().toISOString(), last_error: null })
      .eq("id", queueId)
      .eq("status", "failed")
      .select("id");
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: "Nothing to retry." };
    await sb.from("applications").update({ app_status: "queued" }).eq("job_id", jobId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to retry." };
  }
  revalidateLead(jobId);
  return { ok: true, message: "Re-queued." };
}

// --- Send a follow-up (Sent Emails screen) ----------------------------------
/**
 * Queues the reviewed follow-up as a second outreach_queue row (kind=followup),
 * sent by the same spaced worker as first contact. Gated server-side, not just
 * in the UI: 24h must have passed since the original send, the recruiter must
 * not have replied, and no follow-up may already be out.
 */
export async function enqueueFollowupAction(
  jobId: string,
  input: { to: string; subject: string; body: string },
): Promise<ActionState> {
  if (!jobId) return { ok: false, message: "Missing lead id." };
  const valid = validateEnqueue(input);
  if (!valid.ok) return valid;

  const sb = supabaseAdmin();
  try {
    const [{ data: leadRows, error: leadErr }, { data: sentRows }] = await Promise.all([
      sb.from("applications").select("reply_received,followup_sent").eq("job_id", jobId).limit(1),
      // Gate on when the first email actually went out, matching the UI and
      // the sent_email_stats view.
      sb.from("outreach_queue").select("sent_at")
        .eq("job_id", jobId).eq("kind", "initial").eq("status", "sent")
        .order("sent_at", { ascending: false }).limit(1),
    ]);
    if (leadErr) return { ok: false, message: leadErr.message };
    const lead = leadRows?.[0];
    if (!lead) return { ok: false, message: "Lead not found." };

    const gate = followupUnlocked(
      { sentAt: sentRows?.[0]?.sent_at ?? null,
        replyReceived: lead.reply_received, followupSent: lead.followup_sent },
      Date.now(),
    );
    if (!gate.ok) return gate;

    // Space it from the tail of the queue exactly like a first email.
    const { data: tailRows } = await sb
      .from("outreach_queue")
      .select("scheduled_at")
      .in("status", ["ready", "queued", "sending"])
      .order("scheduled_at", { ascending: false })
      .limit(1);
    const tailMs = tailRows?.[0]?.scheduled_at ? new Date(tailRows[0].scheduled_at).getTime() : null;
    const scheduledAt = computeScheduledAt(Date.now(), tailMs).toISOString();

    const { error: insErr } = await sb.from("outreach_queue").insert({
      job_id: jobId,
      to_email: input.to.trim(),
      subject: input.subject,
      body: input.body,
      resume_id: null,           // never re-attach the resume on a follow-up
      kind: "followup",
      status: "queued",
      scheduled_at: scheduledAt,
    });
    if (insErr) {
      if (insErr.code === "23505") {
        return { ok: false, message: "A follow-up is already queued or sent for this lead." };
      }
      return { ok: false, message: insErr.message };
    }

    // Persist any edits so the screen shows what will actually go out.
    await sb.from("applications")
      .update({ followup_subject: input.subject, followup_body: input.body })
      .eq("job_id", jobId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to queue follow-up." };
  }

  revalidateLead(jobId);
  return { ok: true, message: "Follow-up queued — it will send shortly." };
}
