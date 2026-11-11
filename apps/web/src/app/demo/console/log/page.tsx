import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Log } from "../../../console/_pages/log";

export const metadata: Metadata = { title: "Sync log · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Log who={demoConsoleWho()} searchParams={searchParams} />;
}
