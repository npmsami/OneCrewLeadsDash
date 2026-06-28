"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsFormState } from "@/app/settings/actions";
import type { Settings } from "@/lib/types";

const initial: SettingsFormState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-faint " +
  "outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25";

function Field({
  name, label, hint, defaultValue, placeholder, type = "text", mono,
}: {
  name: string; label: string; hint?: string; defaultValue?: string;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`${inputClass} ${mono ? "font-mono text-[13px]" : ""}`}
      />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings | null }) {
  const [state, action, pending] = useActionState(updateSettingsAction, initial);

  return (
    <form action={action} className="space-y-6">
      <div className="card space-y-5 p-6">
        <Field name="candidate_name" label="Name" defaultValue={settings?.candidate_name}
          placeholder="Mahad Saleem" />
        <Field name="candidate_email" label="Email" type="email" mono
          defaultValue={settings?.candidate_email} placeholder="you@gmail.com"
          hint="Appears in the email signature and as the sender identity." />
        <Field name="candidate_linkedin" label="LinkedIn" mono
          defaultValue={settings?.candidate_linkedin} placeholder="https://www.linkedin.com/in/your-handle" />
        <Field name="resume_url" label="Resume link (Google Drive)" mono
          defaultValue={settings?.resume_url} placeholder="https://drive.google.com/file/d/…/view"
          hint="One resume, attached to every application email. Share it as 'anyone with the link'." />
        <Field name="resume_filename" label="Resume filename" mono
          defaultValue={settings?.resume_filename || "Resume.pdf"} placeholder="Resume.pdf"
          hint="The attachment name recruiters see." />
      </div>

      {/* Go-live toggle */}
      <div className="card flex items-center justify-between gap-4 p-6">
        <div>
          <div className="text-sm font-medium text-fg">Send emails (go-live)</div>
          <div className="mt-1 max-w-md text-xs text-faint">
            Off = dry-run: drafts are stored, never sent. On = the agent will send real
            application emails. (Gmail send layer is wired up separately before this takes effect.)
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" name="send_emails" defaultChecked={settings?.send_emails} className="peer sr-only" />
          <span className="h-6 w-11 rounded-full bg-border transition peer-checked:bg-ok/80 peer-focus:ring-2 peer-focus:ring-accent/30" />
          <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.message && (
          <span className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
