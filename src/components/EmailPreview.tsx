"use client";

import { useState } from "react";

// Opens the generated email_html for a lead in a sandboxed iframe modal.
export function EmailPreview({ html, label }: { html: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!html) return <span className="text-xs text-faint">—</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-border-soft px-2 py-1 text-xs text-muted transition hover:bg-white/5 hover:text-fg"
      >
        Preview
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-soft px-4 py-2.5">
              <span className="truncate text-sm font-medium text-fg">{label}</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-fg"
              >
                Close
              </button>
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={html}
              className="h-[75vh] w-full bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
