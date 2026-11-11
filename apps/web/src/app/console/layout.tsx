import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import "@/ui/console.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { requirePerson } from "@/lib/session";
import { ConsoleFrame } from "./_pages/frame";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  accountsOrNotFound();
  const m = await requirePerson("/console");
  return <ConsoleFrame who={m}>{children}</ConsoleFrame>;
}
