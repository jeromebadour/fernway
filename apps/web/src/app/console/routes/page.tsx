import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { Routes } from "../_pages/routes";

export const metadata: Metadata = { title: "Routes · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Routes who={await consoleWho("/console/routes")} />;
}
