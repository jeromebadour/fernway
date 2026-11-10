import { makeKey } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// A new API key, shown once. Owners and admins only; a member's request answers as if the route weren't there.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (s.p.role === "member") return new Response(null, { status: 404 });
  // A key sends leads in the account's name: only from a confirmed address.
  if (!s.p.emailConfirmed) return answer(403, { ok: false, problems: ["label: confirm your email first; the link is in your inbox"] });
  if (!(await within(`keys:${s.p.accountId}`, 20))) return answer(429, { ok: false, problems: ["label: too many keys made this hour; wait, then try again"] });
  const r = await makeKey(delivery().db, s.p.accountId, s.p.userId, s.body.label);
  return r.ok ? answer(201, r) : answer(422, r);
}
