import type { Metadata } from "next";
import { demoBox, demoQueue, demoWhen } from "@/lib/operator-demo";
import { QueueView } from "../../../operator/_views/health";

export const metadata: Metadata = { title: "Queue · Operator console demo · Fernway" };

export default function Queue() {
  return <QueueView q={demoQueue()} box={demoBox()} w={demoWhen} base="/demo/operator" />;
}
