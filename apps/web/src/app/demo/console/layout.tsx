import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import "@/ui/console.css";
import "@/ui/operator.css";
import { demoConsoleWho } from "@/lib/console-demo";
import { ConsoleFrame } from "../../console/_pages/frame";

// The customer console's public demo: the real pages over an invented clinic's leads, read-only.
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: true } };

export default function ConsoleDemoLayout({ children }: { children: ReactNode }) {
  return <ConsoleFrame who={demoConsoleWho()} demo>{children}</ConsoleFrame>;
}
