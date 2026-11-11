import type { Metadata } from "next";
import { demoGhl } from "@/lib/operator-demo";
import { GhlView } from "../../../operator/_views/health";

export const metadata: Metadata = { title: "GHL · Operator console demo · Fernway" };

export default function Ghl() {
  return <GhlView g={demoGhl()} base="/demo/operator" />;
}
