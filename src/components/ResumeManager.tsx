"use client";

import { useActionState, useState, useTransition } from "react";
import {
  uploadResumeAction,
  setDefaultResumeAction,
  deleteResumeAction,
  type ResumeActionState,
} from "@/app/(dashboard)/job-applications/settings/resumes";
import type { Resume } from "@/lib/types";

const initial: ResumeActionState = { ok: false, message: "" };

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export function ResumeManager({ resumes }: { resumes: Resume[] }) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadResumeAction, initial);
  const [pending, startTransition] = useTransition();
  const [rowMsg, setRowMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<ResumeActionState>) {
    setRowMsg(null);
    startTransition(async () => {
      const res = await fn();
      setRowMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <div className="card p-6">
      <div className="text-sm font-medium text-fg">Resumes</div>
      <p className="mt-1 text-xs text-faint">
        Upload PDF or DOCX resumes (max 5 MB). Pick one as the default attachment; you can also choose per-application on the review screen. Files are stored privately — no public links.
      </p>

      {/* List */}
      <ul className="mt-4 divide-y divide-border-soft">
        {resumes.length === 0 && <li className="py-3 text-sm text-faint">No resumes uploaded yet.</li>}
        {resumes.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-fg">{r.filename}</span>
                {r.is_default && (
                  <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok ring-1 ring-inset ring-ok/25">
                    Default
                  </span>
                )}
              </div>
              <div className="text-[11px] text-faint">
                {r.mime.includes("pdf") ? "PDF" : "DOCX"} · {fmtSize(r.size_bytes)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!r.is_default && (
                <button
                  disabled={pending}
                  onClick={() => run(() => setDefaultResumeAction(r.id))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:bg-white/5 hover:text-fg disabled:opacity-50"
                >
                  Set default
                </button>
              )}
              <button
                disabled={pending}
                onClick={() => run(() => deleteResumeAction(r.id))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {rowMsg && <p className={`mt-2 text-sm ${rowMsg.ok ? "text-ok" : "text-danger"}`}>{rowMsg.text}</p>}

      {/* Upload */}
      <form action={uploadAction} className="mt-5 flex flex-wrap items-center gap-3 border-t border-border-soft pt-4">
        <input
          type="file"
          name="resume"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-white/10"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {uploadState.message && (
          <span className={`text-sm ${uploadState.ok ? "text-ok" : "text-danger"}`}>{uploadState.message}</span>
        )}
      </form>
    </div>
  );
}
