import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Ghl } from "../../../console/_pages/ghl";

export const metadata: Metadata = { title: "GHL connection · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Ghl who={demoConsoleWho()} searchParams={searchParams} />;
}
