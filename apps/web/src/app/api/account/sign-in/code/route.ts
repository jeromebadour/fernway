import { openSession, recoveryLeft, secondStep, verifyValue } from "@fernway/delivery";
import { answer, gate } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { deviceOf, sessionCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// The second step of signing in: the ticket from the password step (5 minutes) and a code from the app, or a recovery
// code. 6 tries per ticket's person in 10 minutes' worth of an hour, so a code can't be guessed.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const { db, cfg } = delivery();
  const t = verifyValue<{ u: number; next: string }>(cfg.key, "two-step", String(g.body.ticket ?? ""));
  if (!t) return answer(401, { ok: false, expired: true, problems: ["form: five minutes have passed; sign in again"] });
  if (!(await within(`two-step:${t.u}`, 6))) return answer(429, { ok: false, problems: ["code: too many wrong codes; wait an hour, then sign in again"] });
  const how = await secondStep(db, cfg.key, t.u, String(g.body.code ?? ""));
  if (!how) return answer(401, { ok: false, problems: ["code: that code doesn't match; use the newest one the app shows"] });
  const token = await openSession(db, t.u, deviceOf(request.headers.get("user-agent")));
  const left = how === "recovery" ? await recoveryLeft(db, t.u) : null;
  return answer(200, { ok: true, next: left !== null ? "/account/security?done=recovery-used" : t.next, recoveryLeft: left }, sessionCookie(token));
}
