import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Log } from "../_pages/log";

export const metadata: Metadata = { title: "Sync log · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Log who={await consoleWho("/console/log")} searchParams={searchParams} />;
}
