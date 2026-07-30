// Pure, testable lead-filter logic shared by the Leads page. Kept free of any
// Supabase import so it can be unit-tested with a mock query builder.

export interface LeadFilterParams {
  q: string;
  status: string;    // all | remaining | queued | applied | done | failed
  source: string;    // all | linkedin | jsearch | glassdoor | monster | ...
  score: string;     // "" | "70" | "80" | "90" (min match_score)
  qualified: string; // all | yes | no
  email: string;     // all | yes | no (recruiter_email present)
  from: string;      // "" | YYYY-MM-DD — earliest date added (created_at)
  to: string;        // "" | YYYY-MM-DD — latest date added, inclusive
  sort: string;      // new | score | posted | updated
}

// Default sort is "new" (most recently scraped first). Anything else buries a
// fresh scrape among months of older leads with the same score, which reads as
// "my scrape produced nothing".
export const DEFAULT_LEAD_SORT = "new";

export const LEAD_FILTER_DEFAULTS: LeadFilterParams = {
  q: "", status: "all", source: "all", score: "", qualified: "all", email: "all",
  from: "", to: "", sort: DEFAULT_LEAD_SORT,
};

/** Accept only YYYY-MM-DD, so a hand-edited URL can't leak into the query. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(v: string | undefined): string {
  const s = (v ?? "").trim();
  return DATE_RE.test(s) ? s : "";
}

/** Normalize raw searchParams into a fully-defaulted, trimmed filter object. */
export function parseLeadFilters(sp: Partial<Record<keyof LeadFilterParams, string>>): LeadFilterParams {
  return {
    q: (sp.q ?? "").trim(),
    status: sp.status ?? "all",
    source: sp.source ?? "all",
    score: sp.score ?? "",
    qualified: sp.qualified ?? "all",
    email: sp.email ?? "all",
    from: cleanDate(sp.from),
    to: cleanDate(sp.to),
    sort: sp.sort ?? DEFAULT_LEAD_SORT,
  };
}

/** True when any filter differs from its default (drives the "Clear" button). */
export function hasActiveFilters(p: LeadFilterParams): boolean {
  return (
    p.q !== "" || p.status !== "all" || p.source !== "all" ||
    p.score !== "" || p.qualified !== "all" || p.email !== "all" ||
    p.from !== "" || p.to !== "" || p.sort !== DEFAULT_LEAD_SORT
  );
}

/** Serialize filters to a query string (omitting defaults) for router.push. */
export function leadFiltersToQuery(p: LeadFilterParams): string {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.status !== "all") params.set("status", p.status);
  if (p.source !== "all") params.set("source", p.source);
  if (p.score) params.set("score", p.score);
  if (p.qualified !== "all") params.set("qualified", p.qualified);
  if (p.email !== "all") params.set("email", p.email);
  if (p.from) params.set("from", p.from);
  if (p.to) params.set("to", p.to);
  if (p.sort !== DEFAULT_LEAD_SORT) params.set("sort", p.sort);
  return params.toString();
}

// Minimal shape of the chainable query builder we depend on (Supabase's
// PostgrestFilterBuilder implements all of these and returns itself).
export interface QueryLike {
  or(f: string): QueryLike;
  eq(col: string, val: unknown): QueryLike;
  gte(col: string, val: unknown): QueryLike;
  lte(col: string, val: unknown): QueryLike;
  is(col: string, val: unknown): QueryLike;
  not(col: string, op: string, val: unknown): QueryLike;
  order(col: string, opts: { ascending: boolean; nullsFirst?: boolean }): QueryLike;
}

// The date filter reads `created_at` — when the lead landed in the hub, i.e.
// which scrape it came from. `posted_date` is the employer's posting date and
// is often weeks older, so it answers a different question.
export const LEAD_DATE_COLUMN = "created_at";

/** Apply the filter params to a Supabase-style query builder and return it. */
export function applyLeadFilters<T extends QueryLike>(query: T, p: LeadFilterParams): T {
  let q = query as QueryLike;

  if (p.q) {
    const safe = p.q.replace(/[,()%*]/g, " ").trim();
    if (safe) q = q.or(`job_title.ilike.%${safe}%,company.ilike.%${safe}%`);
  }
  if (p.status !== "all") q = q.eq("app_status", p.status);
  if (p.source !== "all") q = q.eq("source", p.source);

  const minScore = Number(p.score);
  if (minScore > 0) q = q.gte("match_score", minScore);

  if (p.qualified === "yes") q = q.is("qualified", true);
  else if (p.qualified === "no") q = q.is("qualified", false);

  if (p.email === "yes") q = q.not("recruiter_email", "is", null);
  else if (p.email === "no") q = q.is("recruiter_email", null);

  // Date range on when the lead was added. Both bounds are inclusive whole
  // days, so from=to=today means "just this day's leads".
  if (p.from) q = q.gte(LEAD_DATE_COLUMN, `${p.from}T00:00:00.000Z`);
  if (p.to) q = q.lte(LEAD_DATE_COLUMN, `${p.to}T23:59:59.999Z`);

  if (p.sort === "score") {
    q = q.order("match_score", { ascending: false, nullsFirst: false });
    // Tie-break by recency: dozens of leads share a score, and without this the
    // newest of them sort arbitrarily and can land pages down.
    q = q.order(LEAD_DATE_COLUMN, { ascending: false });
  } else if (p.sort === "posted") {
    q = q.order("posted_date", { ascending: false, nullsFirst: false });
    q = q.order(LEAD_DATE_COLUMN, { ascending: false });
  } else if (p.sort === "updated") {
    q = q.order("updated_at", { ascending: false });
  } else {
    q = q.order(LEAD_DATE_COLUMN, { ascending: false });
  }

  return q as T;
}

export const SOURCE_OPTIONS = [
  "all", "linkedin", "jsearch", "glassdoor", "monster", "indeed", "ziprecruiter", "himalayas",
];

// ---------------------------------------------------------------------------
// Source groups — the two workflow lanes in the sidebar.
//
// "linkedin": postings discovered on LinkedIn. Applied to BY HAND through
//   LinkedIn itself, so these need the job link and a status control, not an
//   email composer.
// "other": every non-LinkedIn source (JSearch/Monster/Glassdoor/boards). These
//   are the ones we email, because a real company domain is reachable.
// ---------------------------------------------------------------------------
export type SourceGroup = "all" | "linkedin" | "other";

export const LINKEDIN_SOURCE = "linkedin";

/** Restrict a query to one lane. Null sources count as "other" (never dropped). */
export function applySourceGroup<T extends QueryLike>(query: T, group: SourceGroup): T {
  if (group === "linkedin") return query.eq("source", LINKEDIN_SOURCE) as T;
  if (group === "other") {
    // `not(source, eq, linkedin)` alone would drop NULL sources, since
    // NOT (NULL = 'linkedin') is NULL in SQL. The explicit is.null keeps them.
    return query.or(`source.neq.${LINKEDIN_SOURCE},source.is.null`) as T;
  }
  return query;
}
