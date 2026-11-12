import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Sheets } from "../_pages/sheets";

export const metadata: Metadata = { title: "Google Sheets · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Sheets who={await consoleWho("/console/sheets")} />;
}
