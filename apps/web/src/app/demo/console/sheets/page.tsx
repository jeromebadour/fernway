import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Sheets } from "../../../console/_pages/sheets";

export const metadata: Metadata = { title: "Google Sheets · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Sheets who={demoConsoleWho()} />;
}
