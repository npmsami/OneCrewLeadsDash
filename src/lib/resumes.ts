// Pure, testable resume-file validation + constants (no Supabase import).

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const RESUME_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const ACCEPTED_MIMES = new Set(Object.values(RESUME_MIME));

export interface ResumeValidation {
  ok: boolean;
  message: string;
  ext?: string;
  mime?: string;
}

/** Validate an uploaded resume by name/type/size. Accepts PDF and DOCX. */
export function validateResume(name: string, type: string, size: number): ResumeValidation {
  if (!name || size === 0) return { ok: false, message: "Choose a PDF or DOCX file." };
  if (size > RESUME_MAX_BYTES) return { ok: false, message: "File too large (max 5 MB)." };

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const mimeByExt = RESUME_MIME[ext];

  // Trust either a known extension or an accepted MIME (browsers vary on DOCX).
  if (mimeByExt && (type === mimeByExt || type === "" || type === "application/octet-stream")) {
    return { ok: true, message: "", ext, mime: mimeByExt };
  }
  if (ACCEPTED_MIMES.has(type)) {
    const resolvedExt = type === RESUME_MIME.pdf ? "pdf" : "docx";
    return { ok: true, message: "", ext: resolvedExt, mime: type };
  }
  return { ok: false, message: "Resume must be a PDF or DOCX file." };
}
