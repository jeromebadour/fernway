import type { Metadata } from "next";
import { demoAccounts, demoOverview, demoWhen } from "@/lib/operator-demo";
import { AccountsView } from "../../../operator/_views/business";

export const metadata: Metadata = { title: "Accounts · Operator console demo · Fernway" };

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  const rows = demoAccounts.filter((a) => !q || [a.name, a.ownerEmail ?? "", `AC ${String(a.id).padStart(6, "0")}`].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  return <AccountsView v={{ q, total: q ? rows.length : demoOverview().accounts, page: 1, rows }} w={demoWhen} base="/demo/operator" />;
}
