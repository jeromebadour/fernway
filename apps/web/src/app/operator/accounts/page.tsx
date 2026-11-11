import type { Metadata } from "next";
import { accountsView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { AccountsView } from "../_views/business";

export const metadata: Metadata = { title: "Accounts · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const [v, w] = await Promise.all([accountsView(delivery().db, { q: sp.q, page: Number(sp.page) || 1 }), staffWhen()]);
  return <AccountsView v={v} w={w} base="/operator" />;
}
