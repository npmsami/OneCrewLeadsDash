"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export interface AuditSettingsFormState {
  ok: boolean;
  message: string;
}

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function updateAuditSettingsAction(
  _prev: AuditSettingsFormState,
  formData: FormData,
): Promise<AuditSettingsFormState> {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const cap = Number(formData.get("daily_send_cap"));

  const payload = {
    id: "singleton",
    agency_name: str("agency_name"),
    tagline: str("tagline"),
    sender_name: str("sender_name"),
    sender_title: str("sender_title"),
    sender_email: str("sender_email"),
    sender_phone: str("sender_phone"),
    sender_address: str("sender_address"),
    unsubscribe_url: str("unsubscribe_url"),
    calendar_link: str("calendar_link"),
    website_url: str("website_url"),
    logo_url: str("logo_url"),
    hero_url: str("hero_url"),
    daily_send_cap: Number.isFinite(cap) && cap > 0 ? Math.min(cap, 200) : 45,
    send_emails: formData.get("send_emails") === "on",
  };

  if (payload.sender_email && !EMAIL_RE.test(payload.sender_email)) {
    return { ok: false, message: "Enter a valid sender email." };
  }
  for (const [label, v] of [
    ["Calendar link", payload.calendar_link],
    ["Website URL", payload.website_url],
    ["Unsubscribe URL", payload.unsubscribe_url],
  ] as const) {
    if (v && !URL_RE.test(v)) return { ok: false, message: `${label} must be a full URL (https://…).` };
  }

  try {
    const { error } = await supabaseAdmin().from("audit_settings").upsert(payload, { onConflict: "id" });
    if (error) return { ok: false, message: error.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to save." };
  }

  revalidatePath("/website-audit/settings");
  revalidatePath("/website-audit");
  return {
    ok: true,
    message: payload.send_emails
      ? "Saved. Live sending is ON — runs will email real recipients."
      : "Saved. Sending is OFF (dry-run) — runs only draft emails.",
  };
}
