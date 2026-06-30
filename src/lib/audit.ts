// Shared constants, types, and the CSV lead parser for the Website-Audit
// automation. Pure (no "use server"), so both server actions and Server
// Components can import it.

// A run drains `daily_send_cap` leads and takes ~15 min; block an overlapping
// batch for 20 min so the same pending leads can't be double-processed.
export const AUDIT_COOLDOWN_MS = 20 * 60 * 1000;

export interface AuditLead {
  email: string;
  first_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  revenue: string | null;
  employees: string | null;
  website: string | null;
  domain: string | null;
  subject: string | null;
  ai_business_name: string | null;
  ai_summary: string | null;
  ai_gaps: string | null;
  email_html: string | null;
  status: string;
  skip_reason: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditStats {
  total: number;
  pending: number;
  dry_run: number;
  sent: number;
  skipped: number;
  send_error: number;
  last_sent_at: string | null;
  last_added_at: string | null;
}

export interface AuditSettings {
  agency_name: string | null;
  tagline: string | null;
  sender_name: string | null;
  sender_title: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  sender_address: string | null;
  unsubscribe_url: string | null;
  calendar_link: string | null;
  website_url: string | null;
  hero_url: string | null;
  logo_url: string | null;
  sign_img_url: string | null;
  daily_send_cap: number;
  send_emails: boolean;
  last_run_at: string | null;
}

export interface AuditRunState {
  ok: boolean;
  message: string;
  lockedUntil: string | null;
}

export const AUDIT_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-white/5 text-muted ring-border-soft" },
  dry_run: { label: "Drafted", cls: "bg-accent-soft text-accent-2 ring-accent/30" },
  sent: { label: "Sent", cls: "bg-ok/10 text-ok ring-ok/25" },
  skipped: { label: "Skipped", cls: "bg-white/5 text-faint ring-border-soft" },
  send_error: { label: "Send error", cls: "bg-danger/10 text-danger ring-danger/25" },
};

// ---------------------------------------------------------------------------
// CSV parsing — header-mapped to audit_leads columns. Accepts the same column
// names as the old Google Sheet (case-insensitive, several aliases each).
// ---------------------------------------------------------------------------
const FIELD_ALIASES: Record<keyof LeadRow, string[]> = {
  email: ["contact email", "email", "email address", "e-mail"],
  first_name: ["first name", "first_name", "firstname"],
  full_name: ["contact name", "name", "full name", "full_name"],
  company: ["company name", "company", "organization", "business name"],
  job_title: ["job title", "title", "job_title", "role"],
  phone: ["phone number", "phone", "telephone", "mobile"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  industry: ["industry type", "industry", "sector"],
  revenue: ["revenue size", "revenue", "annual revenue"],
  employees: ["employees size", "employees", "employee size", "company size", "headcount"],
  website: ["web site", "website", "web site url", "website url", "url", "domain", "site"],
};

export interface LeadRow {
  email: string;
  first_name: string;
  full_name: string;
  company: string;
  job_title: string;
  phone: string;
  city: string;
  state: string;
  industry: string;
  revenue: string;
  employees: string;
  website: string;
}

/** RFC4180-ish tokenizer: handles quoted fields, escaped quotes, commas/newlines in quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // strip a leading BOM
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      // skip fully-blank lines
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface ParseResult {
  rows: LeadRow[];     // rows that have an email (deduped on email)
  total: number;       // data rows seen
  skipped: number;     // rows dropped for missing email
  unmatchedHeaders: string[];
}

/** Parse a leads CSV into audit_leads-shaped rows, mapped by header aliases. */
export function parseLeadsCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], total: 0, skipped: 0, unmatchedHeaders: [] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  // map each target field -> source column index
  const colOf: Partial<Record<keyof LeadRow, number>> = {};
  const matched = new Set<number>();
  for (const field of Object.keys(FIELD_ALIASES) as (keyof LeadRow)[]) {
    const idx = header.findIndex((h) => FIELD_ALIASES[field].includes(h));
    if (idx >= 0) { colOf[field] = idx; matched.add(idx); }
  }
  const unmatchedHeaders = header.filter((_, i) => !matched.has(i) && header[i] !== "");

  const get = (cells: string[], field: keyof LeadRow) => {
    const i = colOf[field];
    return i == null ? "" : (cells[i] ?? "").trim();
  };

  const seen = new Set<string>();
  const rows: LeadRow[] = [];
  let total = 0;
  let skipped = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    total++;
    const email = get(cells, "email").toLowerCase();
    if (!email || !email.includes("@")) { skipped++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({
      email,
      first_name: get(cells, "first_name"),
      full_name: get(cells, "full_name"),
      company: get(cells, "company"),
      job_title: get(cells, "job_title"),
      phone: get(cells, "phone"),
      city: get(cells, "city"),
      state: get(cells, "state"),
      industry: get(cells, "industry"),
      revenue: get(cells, "revenue"),
      employees: get(cells, "employees"),
      website: get(cells, "website"),
    });
  }
  return { rows, total, skipped, unmatchedHeaders };
}
