import type { Metadata } from "next";
import { incidentsView, overviewView, watch } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { boxReading, requireStaff } from "@/lib/operator";
import { OverviewView } from "./_views/health";

export const metadata: Metadata = { title: "Overview · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Overview() {
  await requireStaff();
  const { db } = delivery();
  const box = await boxReading();
  const [watches, o, inc] = await Promise.all([watch(db, box, undefined, Number(process.env.CLAUDE_MONTH_CAP_USD || 8)), overviewView(db), incidentsView(db)]);
  return <OverviewView box={box} watches={watches} o={o} open={inc.rows.filter((i) => !i.closedAt)} base="/operator" />;
}
