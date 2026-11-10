import { changePassword } from "@fernway/delivery";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// A new password: the current one first (10 tries an hour). Every other device signs out; this one stays.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  if (!(await within(`password:${s.p.userId}`, 10))) return answer(429, { ok: false, problems: ["current: too many tries this hour; wait, or reset the password"] });
  const r = await changePassword(delivery().db, s.p.userId, s.p.sessionId, String(s.body.current ?? ""), String(s.body.next ?? ""));
  return r.ok ? answer(200, r) : answer(422, r);
}
