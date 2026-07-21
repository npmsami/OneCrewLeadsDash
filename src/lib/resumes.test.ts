import { describe, it, expect } from "vitest";
import { validateResume, RESUME_MIME, RESUME_MAX_BYTES } from "./resumes";

describe("validateResume", () => {
  it("accepts a PDF by mime", () => {
    const r = validateResume("cv.pdf", RESUME_MIME.pdf, 1000);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe("pdf");
    expect(r.mime).toBe(RESUME_MIME.pdf);
  });

  it("accepts a DOCX by extension even with an empty browser mime", () => {
    const r = validateResume("cv.docx", "", 1000);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe("docx");
    expect(r.mime).toBe(RESUME_MIME.docx);
  });

  it("accepts a DOCX by its real mime", () => {
    const r = validateResume("resume", RESUME_MIME.docx, 1000);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe("docx");
  });

  it("rejects an empty file", () => {
    expect(validateResume("cv.pdf", RESUME_MIME.pdf, 0).ok).toBe(false);
  });

  it("rejects an oversized file", () => {
    expect(validateResume("cv.pdf", RESUME_MIME.pdf, RESUME_MAX_BYTES + 1).ok).toBe(false);
  });

  it("rejects an unsupported type", () => {
    expect(validateResume("cv.txt", "text/plain", 1000).ok).toBe(false);
    expect(validateResume("cv.png", "image/png", 1000).ok).toBe(false);
  });
});
