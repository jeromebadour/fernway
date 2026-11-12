import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Webhooks } from "../../../console/_pages/webhooks";

export const metadata: Metadata = { title: "Webhooks · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Webhooks who={demoConsoleWho()} />;
}
