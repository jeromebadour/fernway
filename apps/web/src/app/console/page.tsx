import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Board } from "./_pages/board";

export const metadata: Metadata = { title: "Delivery board · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Board who={await consoleWho("/console")} />;
}
