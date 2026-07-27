import { Sidebar } from "@/components/Sidebar";
import { ScrapeWatcher } from "@/components/ScrapeWatcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
      {/* Watches an in-flight scrape from any page and refreshes when it lands. */}
      <ScrapeWatcher />
    </div>
  );
}
