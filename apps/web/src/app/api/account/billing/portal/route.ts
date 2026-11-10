import { startPortal } from "@fernway/delivery";
import { answer, appUrl, gate } from "@/lib/account-api";
import { billingOn, stripe } from "@/lib/billing";
import { delivery } from "@/lib/connect";
import { currentPerson, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Opens Stripe's customer portal: card, invoices, switch plan, cancel. Only the account's owner.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  if (!billingOn()) return new Response(null, { status: 404 });
  const p = await currentPerson();
  if (!p) return answer(401, { ok: false, problems: ["form: you were signed out; sign in again"] });
  if (p.role !== "owner") return new Response(null, { status: 404 });
  if (!(await within(`billing:${p.accountId}`, 20))) return answer(429, { ok: false, problems: ["billing: too many tries this hour; try again later"] });
  let r;
  try {
    r = await startPortal(delivery().db, stripe(), p.accountId, appUrl());
  } catch (e) {
    console.error(`stripe: ${e instanceof Error ? e.message : String(e)}`);
    return answer(502, { ok: false, problems: ["stripe: Stripe could not be reached; try again in a minute"] });
  }
  return r.ok ? answer(200, { ok: true, url: r.url }) : answer(409, { ok: false, problems: [r.problem] });
}
