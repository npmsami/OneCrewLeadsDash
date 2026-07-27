import { describe, it, expect } from "vitest";
import {
  parseLeadFilters,
  hasActiveFilters,
  leadFiltersToQuery,
  applyLeadFilters,
  LEAD_FILTER_DEFAULTS,
  applySourceGroup,
  type QueryLike,
} from "./leads";

// Records every chained call so we can assert the query the filters build.
function mockQuery() {
  const calls: unknown[][] = [];
  const q = {
    calls,
    or(f: string) { calls.push(["or", f]); return q; },
    eq(c: string, v: unknown) { calls.push(["eq", c, v]); return q; },
    gte(c: string, v: unknown) { calls.push(["gte", c, v]); return q; },
    is(c: string, v: unknown) { calls.push(["is", c, v]); return q; },
    not(c: string, o: string, v: unknown) { calls.push(["not", c, o, v]); return q; },
    order(c: string, o: unknown) { calls.push(["order", c, o]); return q; },
  };
  return q as QueryLike & { calls: unknown[][] };
}

describe("parseLeadFilters", () => {
  it("fills defaults for missing params", () => {
    expect(parseLeadFilters({})).toEqual(LEAD_FILTER_DEFAULTS);
  });
  it("trims the query and passes values through", () => {
    const p = parseLeadFilters({ q: "  sre  ", status: "applied", qualified: "yes" });
    expect(p.q).toBe("sre");
    expect(p.status).toBe("applied");
    expect(p.qualified).toBe("yes");
  });
});

describe("hasActiveFilters / leadFiltersToQuery", () => {
  it("detects the default (no) filter state", () => {
    expect(hasActiveFilters(LEAD_FILTER_DEFAULTS)).toBe(false);
  });
  it("omits defaults from the query string", () => {
    expect(leadFiltersToQuery(LEAD_FILTER_DEFAULTS)).toBe("");
    const qs = leadFiltersToQuery({ ...LEAD_FILTER_DEFAULTS, status: "applied", email: "yes" });
    expect(qs).toContain("status=applied");
    expect(qs).toContain("email=yes");
    expect(qs).not.toContain("sort=");
  });
});

describe("applyLeadFilters", () => {
  it("filters by app_status", () => {
    const q = mockQuery();
    applyLeadFilters(q, { ...LEAD_FILTER_DEFAULTS, status: "applied" });
    expect(q.calls).toContainEqual(["eq", "app_status", "applied"]);
  });

  it("maps qualified yes/no to boolean is()", () => {
    const yes = mockQuery();
    applyLeadFilters(yes, { ...LEAD_FILTER_DEFAULTS, qualified: "yes" });
    expect(yes.calls).toContainEqual(["is", "qualified", true]);

    const no = mockQuery();
    applyLeadFilters(no, { ...LEAD_FILTER_DEFAULTS, qualified: "no" });
    expect(no.calls).toContainEqual(["is", "qualified", false]);
  });

  it("maps email availability to null / not-null", () => {
    const has = mockQuery();
    applyLeadFilters(has, { ...LEAD_FILTER_DEFAULTS, email: "yes" });
    expect(has.calls).toContainEqual(["not", "recruiter_email", "is", null]);

    const none = mockQuery();
    applyLeadFilters(none, { ...LEAD_FILTER_DEFAULTS, email: "no" });
    expect(none.calls).toContainEqual(["is", "recruiter_email", null]);
  });

  it("applies min score, source, and default sort", () => {
    const q = mockQuery();
    applyLeadFilters(q, { ...LEAD_FILTER_DEFAULTS, score: "80", source: "glassdoor" });
    expect(q.calls).toContainEqual(["gte", "match_score", 80]);
    expect(q.calls).toContainEqual(["eq", "source", "glassdoor"]);
    expect(q.calls).toContainEqual(["order", "match_score", { ascending: false, nullsFirst: false }]);
  });

  it("ignores a zero/empty score", () => {
    const q = mockQuery();
    applyLeadFilters(q, { ...LEAD_FILTER_DEFAULTS, score: "" });
    expect(q.calls.find((c) => c[0] === "gte")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Source groups — the LinkedIn Apply / Send Emails (Other) split
// ---------------------------------------------------------------------------
describe("applySourceGroup", () => {
  function spy() {
    const calls: string[] = [];
    const q: QueryLike = {
      or: (f) => { calls.push(`or:${f}`); return q; },
      eq: (c, v) => { calls.push(`eq:${c}=${v}`); return q; },
      gte: (c, v) => { calls.push(`gte:${c}=${v}`); return q; },
      is: (c, v) => { calls.push(`is:${c}=${v}`); return q; },
      not: (c, o, v) => { calls.push(`not:${c}.${o}.${v}`); return q; },
      order: (c, o) => { calls.push(`order:${c}:${o.ascending}`); return q; },
    };
    return { q, calls };
  }

  it("linkedin group matches only linkedin-sourced rows", () => {
    const { q, calls } = spy();
    applySourceGroup(q, "linkedin");
    expect(calls).toEqual(["eq:source=linkedin"]);
  });

  it("other group excludes linkedin but keeps NULL sources", () => {
    // not(source,eq,linkedin) alone drops NULLs, since NOT (NULL = x) is NULL.
    const { q, calls } = spy();
    applySourceGroup(q, "other");
    expect(calls).toEqual(["or:source.neq.linkedin,source.is.null"]);
  });

  it("all group is a no-op", () => {
    const { q, calls } = spy();
    applySourceGroup(q, "all");
    expect(calls).toEqual([]);
  });

  it("composes with the normal filters without dropping either", () => {
    const { q, calls } = spy();
    applyLeadFilters(applySourceGroup(q, "linkedin"), {
      ...LEAD_FILTER_DEFAULTS, status: "remaining", email: "yes",
    });
    expect(calls).toContain("eq:source=linkedin");
    expect(calls).toContain("eq:app_status=remaining");
    expect(calls).toContain("not:recruiter_email.is.null");
  });
});
