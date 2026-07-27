import { LaneView } from "@/components/LaneView";
import { parseLeadFilters } from "@/lib/leads";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

// LinkedIn postings are applied to by hand on LinkedIn itself, so this lane
// leads with the job link and the Mark-applied control rather than an email
// composer. (The composer is still available per-lead when a recruiter address
// happens to have been found.)
export default async function LinkedInApplyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseLeadFilters(await searchParams);

  return (
    <LaneView
      title="LinkedIn Apply"
      subtitle="apply on LinkedIn, then mark applied here"
      group="linkedin"
      lane="linkedin"
      filters={filters}
      emptyMessage="No LinkedIn leads match these filters."
    />
  );
}
