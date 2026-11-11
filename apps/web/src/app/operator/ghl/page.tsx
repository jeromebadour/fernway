import type { Metadata } from "next";
import { ghlView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { GhlView } from "../_views/health";

export const metadata: Metadata = { title: "GHL · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Ghl() {
  await requireStaff();
  return <GhlView g={await ghlView(delivery().db)} base="/operator" />;
}
