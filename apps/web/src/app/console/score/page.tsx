import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Score } from "../_pages/score";

export const metadata: Metadata = { title: "Lead score · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Score who={await consoleWho("/console/score")} />;
}
