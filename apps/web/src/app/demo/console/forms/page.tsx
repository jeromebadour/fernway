import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Forms } from "../../../console/_pages/forms";

export const metadata: Metadata = { title: "Embed forms · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Forms who={demoConsoleWho()} />;
}
