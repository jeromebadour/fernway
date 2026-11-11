import type { Metadata } from "next";
import { emailView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { EmailView } from "../_views/business";

export const metadata: Metadata = { title: "Email · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Email() {
  await requireStaff();
  const [v, w] = await Promise.all([emailView(delivery().db), staffWhen()]);
  return <EmailView v={v} w={w} />;
}
