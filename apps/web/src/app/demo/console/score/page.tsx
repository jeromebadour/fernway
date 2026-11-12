import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Score } from "../../../console/_pages/score";

export const metadata: Metadata = { title: "Lead score · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Score who={demoConsoleWho()} />;
}
