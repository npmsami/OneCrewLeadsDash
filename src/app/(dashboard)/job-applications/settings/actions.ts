"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export interface SettingsFormState {
  ok: boolean;
  message: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/.+/i;

export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const payload = {
    id: "singleton",
    candidate_name: String(formData.get("candidate_name") ?? "").trim(),
    candidate_email: String(formData.get("candidate_email") ?? "").trim(),
    candidate_linkedin: String(formData.get("candidate_linkedin") ?? "").trim(),
    // resume_url is managed by the resume upload action, not this form.
    resume_filename: String(formData.get("resume_filename") ?? "").trim() || "Resume.pdf",
    send_emails: formData.get("send_emails") === "on",
    email_template: String(formData.get("email_template") ?? ""),
    followup_template: String(formData.get("followup_template") ?? ""),
  };

  if (payload.candidate_email && !EMAIL_RE.test(payload.candidate_email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (payload.candidate_linkedin && !URL_RE.test(payload.candidate_linkedin)) {
    return { ok: false, message: "LinkedIn must be a full URL (https://…)." };
  }

  try {
    const { error } = await supabaseAdmin().from("settings").upsert(payload, { onConflict: "id" });
    if (error) return { ok: false, message: error.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to save settings." };
  }

  revalidatePath("/job-applications/settings");
  revalidatePath("/job-applications");
  return { ok: true, message: "Candidate Signature saved." };
}
