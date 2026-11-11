import { syncAccount } from "@fernway/delivery";
import { answer } from "@/lib/account-api";
import { billingDeps, billingOn } from "@/lib/billing";
import { staffAction } from "@/lib/operator";

export const dynamic = "force-dynamic";

// Reads an account's subscription again from Stripe, as a webhook would. Staff only (404 for anyone else), with a
// fresh authenticator code; on the operator audit log.
export async function POST(request: Request) {
  const a = await staffAction(request);
  if ("refused" in a) return a.refused;
  if (!billingOn()) return answer(503, { ok: false, problems: ["form: Stripe isn't set up on this server"] });
  try {
    const r = await syncAccount(billingDeps(), a.s, Number(a.body.accountId));
    return answer(r.ok ? 200 : 422, r);
  } catch (err) {
    console.error(`operator: Stripe sync failed: ${err instanceof Error ? err.message : String(err)}`);
    return answer(502, { ok: false, problems: ["form: Stripe didn't answer; try again in a minute"] });
  }
}
