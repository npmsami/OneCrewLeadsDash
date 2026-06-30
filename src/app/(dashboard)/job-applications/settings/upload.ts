"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export interface UploadState {
  ok: boolean;
  message: string;
}

const BUCKET = "resumes";
const OBJECT_PATH = "resume.pdf"; // single resume, overwritten on each upload
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadResumeAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a PDF file." };
  }
  if (file.type !== "application/pdf") {
    return { ok: false, message: "Resume must be a PDF." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File too large (max 5 MB)." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = supabaseAdmin();

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, message: upErr.message };

  // resume_url holds the storage object path; the agent downloads it from the
  // private 'resumes' bucket via the service role. resume_filename is the name
  // recruiters see on the attachment.
  const { error: dbErr } = await sb
    .from("settings")
    .update({ resume_url: OBJECT_PATH, resume_filename: file.name })
    .eq("id", "singleton");
  if (dbErr) return { ok: false, message: dbErr.message };

  revalidatePath("/job-applications/settings");
  return { ok: true, message: `Uploaded ${file.name}.` };
}
