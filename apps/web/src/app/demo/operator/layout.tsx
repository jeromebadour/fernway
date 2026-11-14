import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import "@/ui/console.css";
import "@/ui/operator.css";
import { demoStaff } from "@/lib/operator-demo";
import { OpsFrame } from "../../operator/_views/frame";

// The operator console's public demo: the real console's views over invented data; every action only shows itself.
export const dynamic = "force-dynamic";
// Invented data: kept out of search results, like the customer console demo (its links are still followed).
export const metadata = { robots: { index: false, follow: true } };

export default function OperatorDemoLayout({ children }: { children: ReactNode }) {
  return <OpsFrame who={{ name: demoStaff.name, role: demoStaff.role }} demo>{children}</OpsFrame>;
}
