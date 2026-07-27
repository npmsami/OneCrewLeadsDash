// Pure, testable lead-filter logic shared by the Leads page. Kept free of any
// Supabase import so it can be unit-tested with a mock query builder.

export interface LeadFilterParams {
  q: string;
  status: string;    // all | remaining | queued | applied | done | failed
  source: string;    // all | linkedin | jsearch | glassdoor | monster | ...
  score: string;     // "" | "70" | "80" | "90" (min match_score)
  qualified: string; // all | yes | no
  email: string;     // all | yes | no (recruiter_email present)
  sort: string;      // score | posted | updated
}

export const LEAD_FILTER_DEFAULTS: LeadFilterParams = {
  q: "", status: "all", source: "all", score: "", qualified: "all", email: "all", sort: "score",
};

/** Normalize raw searchParams into a fully-defaulted, trimmed filter object. */
export function parseLeadFilters(sp: Partial<Record<keyof LeadFilterParams, string>>): LeadFilterParams {
  return {
    q: (sp.q ?? "").trim(),
    status: sp.status ?? "all",
    source: sp.source ?? "all",
    score: sp.score ?? "",
    qualified: sp.qualified ?? "all",
    email: sp.email ?? "all",
    sort: sp.sort ?? "score",
  };
}

/** True when any filter differs from its default (drives the "Clear" button). */
export function hasActiveFilters(p: LeadFilterParams): boolean {
  return (
    p.q !== "" || p.status !== "all" || p.source !== "all" ||
    p.score !== "" || p.qualified !== "all" || p.email !== "all" || p.sort !== "score"
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
  if (p.sort !== "score") params.set("sort", p.sort);
  return params.toString();
}

// Minimal shape of the chainable query builder we depend on (Supabase's
// PostgrestFilterBuilder implements all of these and returns itself).
export interface QueryLike {
  or(f: string): QueryLike;
  eq(col: string, val: unknown): QueryLike;
  gte(col: string, val: unknown): QueryLike;
  is(col: string, val: unknown): QueryLike;
  not(col: string, op: string, val: unknown): QueryLike;
  order(col: string, opts: { ascending: boolean; nullsFirst?: boolean }): QueryLike;
}

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

  if (p.sort === "posted") q = q.order("posted_date", { ascending: false, nullsFirst: false });
  else if (p.sort === "updated") q = q.order("updated_at", { ascending: false });
  else q = q.order("match_score", { ascending: false, nullsFirst: false });

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
