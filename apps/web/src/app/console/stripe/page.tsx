import type { Metadata } from "next";
import { consoleWho } from "@/lib/console-data";
import { StripeIn } from "../_pages/stripe";

export const metadata: Metadata = { title: "Stripe payments · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <StripeIn who={await consoleWho("/console/stripe")} />;
}
