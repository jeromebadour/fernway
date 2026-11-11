import type { Metadata } from "next";
import { demoStripe, demoWhen } from "@/lib/operator-demo";
import { StripeView } from "../../../operator/_views/business";

export const metadata: Metadata = { title: "Stripe · Operator console demo · Fernway" };

export default async function Stripe({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.min(15, Math.max(1, Number((await searchParams).page) || 1));
  return <StripeView v={demoStripe(page)} w={demoWhen} base="/demo/operator" />;
}
