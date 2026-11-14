import type { Metadata } from "next";
import { demoConsoleWho } from "@/lib/console-demo";
import { StripeIn } from "../../../console/_pages/stripe";

export const metadata: Metadata = { title: "Stripe payments · Console demo · Fernway" };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <StripeIn who={demoConsoleWho()} />;
}
