"use client";

import { useActionState } from "react";
import { uploadResumeAction, type UploadState } from "@/app/(dashboard)/settings/upload";

const initial: UploadState = { ok: false, message: "" };

export function ResumeUpload({
  filename,
  previewUrl,
}: {
  filename: string;
  previewUrl: string | null;
}) {
  const [state, action, pending] = useActionState(uploadResumeAction, initial);

  return (
    <div className="card p-6">
      <div className="text-sm font-medium text-fg">Resume</div>
      <p className="mt-1 text-xs text-faint">
        One PDF, attached to every application email. Re-upload anytime to replace it.
      </p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {previewUrl ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-medium text-ok ring-1 ring-inset ring-ok/25">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Uploaded
            </span>
            <a href={previewUrl} target="_blank" rel="noreferrer" className="font-mono text-muted hover:text-accent-2">
              {filename || "resume.pdf"}
            </a>
          </>
        ) : (
          <span className="text-faint">No resume uploaded yet.</span>
        )}
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="resume"
          accept="application/pdf"
          required
          className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-white/10"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Uploading…" : previewUrl ? "Replace" : "Upload"}
        </button>
        {state.message && (
          <span className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span>
        )}
      </form>
    </div>
  );
}
