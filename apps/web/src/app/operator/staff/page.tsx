import type { Metadata } from "next";
import { operatorAuditView, staffList } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { StaffView } from "../_views/people";

export const metadata: Metadata = { title: "Staff · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Staff({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const s = await requireStaff();
  const { db } = delivery();
  const [list, audit, w] = await Promise.all([staffList(db), operatorAuditView(db, Number((await searchParams).page) || 1), staffWhen()]);
  return <StaffView staff={list} audit={audit} me={{ userId: s.userId, role: s.role }} w={w} base="/operator" />;
}
