import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { Routes } from "../../../console/_pages/routes";

export const metadata: Metadata = { title: "Routes · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Routes who={demoConsoleWho()} />;
}
