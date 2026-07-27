import { LaneView } from "@/components/LaneView";
import { parseLeadFilters } from "@/lib/leads";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

// Everything not sourced from LinkedIn (JSearch, which also carries Monster /
// Glassdoor / Indeed via publisher tagging, plus the remote boards). These
// reach a real company domain, so Hunter can find a recruiter and we email.
export default async function SendEmailsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseLeadFilters(await searchParams);

  return (
    <LaneView
      title="Send Emails (Other)"
      subtitle="Monster, Glassdoor, JSearch & boards — emailed, not hand-applied"
      group="other"
      lane="outreach"
      filters={filters}
      emptyMessage="No non-LinkedIn leads match these filters."
      showFindEmails
    />
  );
}
