import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Lead } from "../../../../console/_pages/lead";

export const metadata: Metadata = { title: "Lead · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Lead who={demoConsoleWho()} params={params} />;
}
