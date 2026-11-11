import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import "@/ui/console.css";
import "@/ui/operator.css";
import { requireStaff } from "@/lib/operator";
import { OpsFrame } from "./_views/frame";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const s = await requireStaff();
  return <OpsFrame who={{ name: s.name, role: s.role }}>{children}</OpsFrame>;
}
