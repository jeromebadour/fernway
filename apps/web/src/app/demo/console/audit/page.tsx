import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Audit } from "../../../console/_pages/audit";

export const metadata: Metadata = { title: "Audit log · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Audit who={demoConsoleWho()} searchParams={searchParams} />;
}
