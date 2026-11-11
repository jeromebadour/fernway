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

export default function OperatorDemoLayout({ children }: { children: ReactNode }) {
  return <OpsFrame who={{ name: demoStaff.name, role: demoStaff.role }} demo>{children}</OpsFrame>;
}
