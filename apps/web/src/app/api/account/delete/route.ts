import { deleteAccount } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { billingOn, stripe } from "@/lib/billing";
import { intake } from "@/lib/intake";
import { endCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Deletes the account from GHL, Stripe and Fernway, owner only, the account's name typed to confirm. Each step is
// reported; if one can't be done, nothing in Fernway is removed and running it again carries on.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (s.p.role !== "owner") return new Response(null, { status: 404 });
  if (!(await within(`delete:${s.p.accountId}`, 10))) return answer(429, { ok: false, problems: ["name: too many tries this hour; wait, then try again"] });
  const { deps, accountId: site } = intake();
  const r = await deleteAccount({ ...deps, stripe: billingOn() ? stripe() : null }, s.p, site, String(s.body.name ?? ""));
  return r.ok ? answer(200, { ...r, next: "/sign-in?done=account-deleted" }, endCookie()) : answer(r.steps.length ? 503 : 422, r);
}
