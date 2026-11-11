import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Board } from "../../console/_pages/board";

export const metadata: Metadata = { title: "Delivery board · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Board who={demoConsoleWho()} />;
}
