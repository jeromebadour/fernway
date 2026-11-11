import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Audit } from "../_pages/audit";

export const metadata: Metadata = { title: "Audit log · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Audit who={await consoleWho("/console/audit")} searchParams={searchParams} />;
}
