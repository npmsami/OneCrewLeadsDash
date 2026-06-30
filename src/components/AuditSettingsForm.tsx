"use client";

import { useActionState } from "react";
import {
  updateAuditSettingsAction,
  type AuditSettingsFormState,
} from "@/app/(dashboard)/website-audit/settings/actions";
import type { AuditSettings } from "@/lib/audit";

const initial: AuditSettingsFormState = { ok: false, message: "" };

function Field({
  label, name, defaultValue, placeholder, hint, type = "text",
}: {
  label: string; name: string; defaultValue?: string | null; placeholder?: string; hint?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border-soft bg-panel/60 px-3 py-2 text-sm text-fg outline-none ring-accent/30 placeholder:text-faint focus:ring-2"
      />
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function AuditSettingsForm({ settings }: { settings: AuditSettings | null }) {
  const [state, action, pending] = useActionState(updateAuditSettingsAction, initial);
  const s = settings;

  return (
    <form action={action} className="space-y-6">
      {/* Go-live toggle */}
      <div className="card p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="send_emails"
            defaultChecked={s?.send_emails ?? false}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            <span className="text-sm font-medium text-fg">Live sending</span>
            <span className="mt-0.5 block text-xs text-faint">
              Off = runs only draft emails (dry-run). On = runs email real recipients via your
              connected Gmail. Leave off until you&apos;ve previewed a few drafts.
            </span>
          </span>
        </label>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-medium text-fg">Sender &amp; brand</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agency name" name="agency_name" defaultValue={s?.agency_name} />
          <Field label="Tagline" name="tagline" defaultValue={s?.tagline} placeholder="We ship. You scale." />
          <Field label="Sender name" name="sender_name" defaultValue={s?.sender_name} />
          <Field label="Sender title" name="sender_title" defaultValue={s?.sender_title} />
          <Field label="Sender email (shown in signature)" name="sender_email" defaultValue={s?.sender_email} />
          <Field label="Sender phone" name="sender_phone" defaultValue={s?.sender_phone} />
        </div>
        <Field
          label="Postal address (CAN-SPAM, required for compliance)"
          name="sender_address"
          defaultValue={s?.sender_address}
          placeholder="OneCrew Technologies · 123 Main St, City, ST 00000"
        />
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-medium text-fg">Links &amp; images</div>
        <Field
          label="Calendar / booking link (the CTA button)"
          name="calendar_link"
          defaultValue={s?.calendar_link}
          placeholder="https://cal.com/onecrewtech/30min"
          hint="Where 'Book a call' sends leads — your Cal.com / Calendly event."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website URL" name="website_url" defaultValue={s?.website_url} />
          <Field label="Unsubscribe URL" name="unsubscribe_url" defaultValue={s?.unsubscribe_url} />
          <Field label="Logo image URL (hosted PNG)" name="logo_url" defaultValue={s?.logo_url} hint="Must be a public raster URL — SVG won't render in email." />
          <Field label="Hero banner URL (hosted image)" name="hero_url" defaultValue={s?.hero_url} hint="Use a direct-image host (e.g. dl.dropboxusercontent.com)." />
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-medium text-fg">Sending</div>
        <Field
          label="Batch size (leads processed per Run)"
          name="daily_send_cap"
          type="number"
          defaultValue={String(s?.daily_send_cap ?? 45)}
          hint="~45 at ~18s apart lands a batch over ~15 min. Workspace allows ~2,000/day."
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.message && (
          <span className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
