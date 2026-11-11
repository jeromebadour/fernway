import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { TeamPage } from "../../../console/_pages/team";

export const metadata: Metadata = { title: "Team · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <TeamPage who={demoConsoleWho()} />;
}
