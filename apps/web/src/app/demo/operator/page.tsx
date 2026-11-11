import type { Metadata } from "next";
import { demoBox, demoIncidents, demoOverview, demoWatches } from "@/lib/operator-demo";
import { OverviewView } from "../../operator/_views/health";

export const metadata: Metadata = { title: "Operator console demo · Fernway", description: "Fernway's own operator console, read-only, with invented data." };

export default function Overview() {
  return <OverviewView box={demoBox()} watches={demoWatches()} o={demoOverview()} open={demoIncidents().filter((i) => !i.closedAt)} base="/demo/operator" />;
}
