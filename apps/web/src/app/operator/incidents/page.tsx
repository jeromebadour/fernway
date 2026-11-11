import type { Metadata } from "next";
import { incidentsView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { IncidentsView } from "../_views/people";

export const metadata: Metadata = { title: "Incidents · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Incidents({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const s = await requireStaff();
  const [v, w] = await Promise.all([incidentsView(delivery().db, Number((await searchParams).page) || 1), staffWhen()]);
  return <IncidentsView v={v} w={w} base="/operator" can={s.role !== "viewer"} />;
}
