import "server-only";
import { createStripe, ingestLead, type BillingDeps } from "@fernway/delivery";
import { accountsOn } from "./accounts-on";
import { delivery } from "./connect";
import { intake } from "./intake";

// Stripe, test mode only (createStripe refuses a live key). Billing is part of the account area, so it is off whenever
// accounts are, and while the test keys are missing.
type Stripe = ReturnType<typeof createStripe>;
const g = globalThis as unknown as { fernwayStripe?: Stripe };

export const billingOn = () => accountsOn() && !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

export function stripe(): Stripe {
  if (!g.fernwayStripe) g.fernwayStripe = createStripe(process.env.STRIPE_SECRET_KEY ?? "");
  return g.fernwayStripe;
}

/** What the webhook needs: the database, Stripe, and the site's own intake for the move to Customer. */
export function billingDeps(): BillingDeps {
  return {
    db: delivery().db,
    stripe: stripe(),
    sendLead: (input) => {
      const { deps, accountId } = intake();
      return ingestLead(deps, accountId, input);
    },
  };
}
