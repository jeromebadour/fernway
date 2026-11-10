import "server-only";
import { accountForKey } from "@fernway/delivery";
import { delivery } from "./connect";
import { demoAccount } from "./intake";

// The key printed in the docs. It is shown only if it really is a live key of the Break it demo account: a key for
// any other account is never published, whatever FERNWAY_DOCS_KEY says.
export async function publicDocsKey(): Promise<string | null> {
  const raw = process.env.FERNWAY_DOCS_KEY?.trim();
  if (!raw) return null;
  return (await accountForKey(delivery().db, raw)) === demoAccount() ? raw : null;
}

// The route the docs' examples use on the demo account (contact only, into the stand-in GHL).
export const DOCS_ROUTE = "demo";
