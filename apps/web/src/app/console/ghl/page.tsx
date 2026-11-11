import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Ghl } from "../_pages/ghl";

export const metadata: Metadata = { title: "GHL connection · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Ghl who={await consoleWho("/console/ghl")} searchParams={searchParams} />;
}
