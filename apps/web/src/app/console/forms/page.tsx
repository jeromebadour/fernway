import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Forms } from "../_pages/forms";

export const metadata: Metadata = { title: "Embed forms · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Forms who={await consoleWho("/console/forms")} />;
}
