import type { Metadata } from "next";
import { stripeView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requireStaff } from "@/lib/operator";
import { staffWhen } from "@/lib/operator-when";
import { StripeView } from "../_views/business";

export const metadata: Metadata = { title: "Stripe · Operator · Fernway" };
export const dynamic = "force-dynamic";

export default async function Stripe({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireStaff();
  const [v, w] = await Promise.all([stripeView(delivery().db, Number((await searchParams).page) || 1), staffWhen()]);
  return <StripeView v={v} w={w} base="/operator" />;
}
