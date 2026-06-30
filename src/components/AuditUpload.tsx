"use client";

import { useActionState } from "react";
import { uploadLeadsAction, type UploadLeadsState } from "@/app/(dashboard)/website-audit/upload-action";

const initial: UploadLeadsState = { ok: false, message: "" };

export function AuditUpload() {
  const [state, action, pending] = useActionState(uploadLeadsAction, initial);

  return (
    <div className="card p-6">
      <div className="text-sm font-medium text-fg">Import leads (CSV)</div>
      <p className="mt-1 text-xs text-faint">
        Upload your leads CSV. Recognized columns: Contact Email, First Name, Company Name, Web Site,
        Job Title, Phone, City, State, Industry, Revenue, Employees. New emails are queued as{" "}
        <span className="text-muted">pending</span>; already-imported emails are left untouched.
      </p>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          required
          className="block text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-white/10"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import CSV"}
        </button>
        {state.message && (
          <span className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</span>
        )}
      </form>
    </div>
  );
}
