import { planKeys, startCheckout } from "@fernway/delivery";
import { answer, appUrl, gate } from "@/lib/account-api";
import { billingOn, stripe } from "@/lib/billing";
import { delivery } from "@/lib/connect";
import { currentPerson, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Opens Stripe Checkout for a plan. Only the account's owner pays.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  if (!billingOn()) return new Response(null, { status: 404 });
  const p = await currentPerson();
  if (!p) return answer(401, { ok: false, problems: ["form: you were signed out; sign in again"] });
  if (p.role !== "owner") return new Response(null, { status: 404 });
  // Paying acts in the account's name: only from a confirmed address.
  if (!p.emailConfirmed) return answer(403, { ok: false, problems: ["email: confirm your email first; the link is in your inbox"] });
  const plan = planKeys.find((k) => k === g.body.plan);
  if (!plan) return answer(422, { ok: false, problems: ["plan: Starter, Growth or Scale"] });
  if (!(await within(`billing:${p.accountId}`, 20))) return answer(429, { ok: false, problems: ["billing: too many tries this hour; try again later"] });
  let r;
  try {
    r = await startCheckout(delivery().db, stripe(), { accountId: p.accountId, accountName: p.accountName, email: p.email, name: p.name }, plan, appUrl());
  } catch (e) {
    console.error(`stripe: ${e instanceof Error ? e.message : String(e)}`);
    return answer(502, { ok: false, problems: ["stripe: Stripe could not be reached; try again in a minute"] });
  }
  return r.ok ? answer(200, { ok: true, url: r.url }) : answer(409, { ok: false, problems: [r.problem] });
}
