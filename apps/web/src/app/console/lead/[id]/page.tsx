import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Lead } from "../../_pages/lead";

export const metadata: Metadata = { title: "Lead · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Lead who={await consoleWho("/console/log")} params={params} />;
}
