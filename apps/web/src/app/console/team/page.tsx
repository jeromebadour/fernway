import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { TeamPage } from "../_pages/team";

export const metadata: Metadata = { title: "Team · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <TeamPage who={await consoleWho("/console/team")} />;
}
