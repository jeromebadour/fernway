import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Webhooks } from "../_pages/webhooks";

export const metadata: Metadata = { title: "Webhooks · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Webhooks who={await consoleWho("/console/webhooks")} />;
}
