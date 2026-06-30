"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { parseLeadsCsv } from "@/lib/audit";

export interface UploadLeadsState {
  ok: boolean;
  message: string;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB (~5k+ rows fits comfortably)
const CHUNK = 500;

export async function uploadLeadsAction(
  _prev: UploadLeadsState,
  formData: FormData,
): Promise<UploadLeadsState> {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "File too large (max 15 MB)." };
  }

  let parsed;
  try {
    parsed = parseLeadsCsv(await file.text());
  } catch {
    return { ok: false, message: "Couldn't read that CSV." };
  }
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message: "No rows with an email column found. Expected a 'Contact Email' / 'Email' header.",
    };
  }

  // New leads land as 'pending'; re-uploading an existing email leaves its row
  // (and any prior status) untouched so we never re-queue an already-sent lead.
  const rows = parsed.rows.map((r) => ({ ...r, status: "pending" as const }));
  const admin = supabaseAdmin();
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await admin
        .from("audit_leads")
        .upsert(slice, { onConflict: "email", ignoreDuplicates: true });
      if (error) return { ok: false, message: error.message };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Upload failed." };
  }

  revalidatePath("/website-audit");
  revalidatePath("/website-audit/leads");
  const extra = parsed.skipped ? ` (${parsed.skipped} skipped — no email)` : "";
  return {
    ok: true,
    message: `Imported ${rows.length} lead${rows.length === 1 ? "" : "s"}${extra}. New ones are queued as pending.`,
  };
}
