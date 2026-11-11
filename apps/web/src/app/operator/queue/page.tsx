import type { Metadata } from "next";
import { queueView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { boxReading, requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { QueueView } from "../_views/health";

export const metadata: Metadata = { title: "Queue · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Queue() {
  await requireStaff();
  const [q, box, w] = await Promise.all([queueView(delivery().db), boxReading(), staffWhen()]);
  return <QueueView q={q} box={box} w={w} base="/operator" />;
}
