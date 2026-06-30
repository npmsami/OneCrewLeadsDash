import { redirect } from "next/navigation";
import { DEFAULT_AUTOMATION } from "@/lib/automations";

// The hub root sends you to the default automation's section.
export default function DashboardRoot() {
  redirect(DEFAULT_AUTOMATION.basePath);
}
