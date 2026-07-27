// Single source of truth for the multi-automation hub. The Sidebar renders the
// automation switcher + the active automation's sub-nav from this registry.
// Routes are literal per automation (e.g. /job-applications/leads) so each
// automation's pages are free to differ in shape.

export interface AutomationNavItem {
  href: string; // absolute path, e.g. "/job-applications/leads"
  label: string;
}

export interface Automation {
  id: string; // url segment + icon key, e.g. "job-applications"
  name: string;
  tagline: string;
  basePath: string; // "/job-applications"
  available: boolean; // false => shown in the switcher but disabled ("Soon")
  nav: AutomationNavItem[];
}

export const AUTOMATIONS: Automation[] = [
  {
    id: "job-applications",
    name: "Job Applications",
    tagline: "Auto-apply to remote roles",
    basePath: "/job-applications",
    available: true,
    // Leads split by how you actually act on them: LinkedIn postings get
    // applied to by hand through LinkedIn; everything else is where Hunter
    // finds a recruiter address, so those get an email.
    nav: [
      { href: "/job-applications", label: "Overview" },
      { href: "/job-applications/linkedin", label: "LinkedIn Apply" },
      { href: "/job-applications/outreach", label: "Send Emails (Other)" },
      { href: "/job-applications/sent", label: "Sent Emails" },
      { href: "/job-applications/leads", label: "All Leads" },
      { href: "/job-applications/settings", label: "Candidate Signature" },
    ],
  },
  {
    id: "website-audit",
    name: "Website Audit Outreach",
    tagline: "Personalized HTML cold emails",
    basePath: "/website-audit",
    available: true,
    nav: [
      { href: "/website-audit", label: "Overview" },
      { href: "/website-audit/leads", label: "Leads" },
      { href: "/website-audit/settings", label: "Settings" },
    ],
  },
];

export const DEFAULT_AUTOMATION = AUTOMATIONS[0];

/** The automation whose section the given pathname belongs to (defaults to the first). */
export function automationForPath(pathname: string): Automation {
  return (
    AUTOMATIONS.find(
      (a) => pathname === a.basePath || pathname.startsWith(a.basePath + "/"),
    ) ?? DEFAULT_AUTOMATION
  );
}
