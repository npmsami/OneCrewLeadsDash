"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { validateResume } from "@/lib/resumes";

export interface ResumeActionState {
  ok: boolean;
  message: string;
}

const BUCKET = "resumes";

function revalidateResumes() {
  revalidatePath("/job-applications/settings");
  revalidatePath("/job-applications");
}

// Upload a new resume (PDF or DOCX) into the PRIVATE bucket + register a row.
export async function uploadResumeAction(_prev: ResumeActionState, formData: FormData): Promise<ResumeActionState> {
  const file = formData.get("resume");
  if (!(file instanceof File)) return { ok: false, message: "Choose a PDF or DOCX file." };

  const check = validateResume(file.name, file.type, file.size);
  if (!check.ok) return { ok: false, message: check.message };

  const id = randomUUID();
  const storagePath = `${id}.${check.ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = supabaseAdmin();

  try {
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: check.mime!, upsert: false });
    if (upErr) return { ok: false, message: upErr.message };

    // First resume becomes the default automatically.
    const { count } = await sb.from("resumes").select("id", { count: "exact", head: true });
    const makeDefault = (count ?? 0) === 0;

    const { error: dbErr } = await sb.from("resumes").insert({
      id,
      filename: file.name,
      storage_path: storagePath,
      mime: check.mime,
      size_bytes: file.size,
      is_default: makeDefault,
    });
    if (dbErr) {
      // Roll back the orphaned object on a DB failure.
      await sb.storage.from(BUCKET).remove([storagePath]);
      return { ok: false, message: dbErr.message };
    }

    if (makeDefault) {
      await sb.from("settings").update({ default_resume_id: id }).eq("id", "singleton");
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Upload failed." };
  }

  revalidateResumes();
  return { ok: true, message: `Uploaded ${file.name}.` };
}

// Set a resume as the default attachment.
export async function setDefaultResumeAction(resumeId: string): Promise<ResumeActionState> {
  if (!resumeId) return { ok: false, message: "Missing resume id." };
  const sb = supabaseAdmin();
  try {
    // Clear the old default first (partial unique index allows only one true).
    await sb.from("resumes").update({ is_default: false }).eq("is_default", true);
    const { error } = await sb.from("resumes").update({ is_default: true }).eq("id", resumeId);
    if (error) return { ok: false, message: error.message };
    await sb.from("settings").update({ default_resume_id: resumeId }).eq("id", "singleton");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to set default." };
  }
  revalidateResumes();
  return { ok: true, message: "Default resume updated." };
}

// Remove a resume (storage object + row). Blocked if it's attached to an
// active queue item so an in-flight send never loses its attachment.
export async function deleteResumeAction(resumeId: string): Promise<ResumeActionState> {
  if (!resumeId) return { ok: false, message: "Missing resume id." };
  const sb = supabaseAdmin();
  try {
    const { data: inUse } = await sb
      .from("outreach_queue")
      .select("id")
      .eq("resume_id", resumeId)
      .in("status", ["ready", "queued", "sending"])
      .limit(1);
    if (inUse && inUse.length > 0) {
      return { ok: false, message: "This resume is attached to a queued email — cancel it first." };
    }

    const { data: row } = await sb.from("resumes").select("storage_path, is_default").eq("id", resumeId).limit(1);
    const storagePath = row?.[0]?.storage_path as string | undefined;
    const wasDefault = Boolean(row?.[0]?.is_default);

    const { error } = await sb.from("resumes").delete().eq("id", resumeId);
    if (error) return { ok: false, message: error.message };
    if (storagePath) await sb.storage.from(BUCKET).remove([storagePath]);
    if (wasDefault) await sb.from("settings").update({ default_resume_id: null }).eq("id", "singleton");
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to delete." };
  }
  revalidateResumes();
  return { ok: true, message: "Resume removed." };
}
