import { signIn, signValue } from "@fernway/delivery";
import { answer, gate, ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { deviceOf, safeNext, sessionCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Signing in: 10 tries an hour per visitor and per email, the same answer for a wrong email and a wrong password.
// With two-step sign-in on, the right password gives a 5-minute ticket for the second step, not a session.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const email = String(g.body.email ?? "").trim().toLowerCase();
  if (!(await within(`signin:ip:${ip(request)}`, 20)) || !(await within(`signin:email:${email}`, 10))) {
    return answer(429, { ok: false, problems: ["form: too many tries in an hour; wait, or reset the password"] });
  }
  const { db, cfg } = delivery();
  const s = await signIn(db, email, String(g.body.password ?? ""), deviceOf(request.headers.get("user-agent")));
  if (!s) return answer(401, { ok: false, problems: ["form: that email and password don't match an account"] });
  const next = safeNext(String(g.body.next ?? ""));
  if ("twoStep" in s) return answer(200, { ok: true, twoStep: true, ticket: signValue(cfg.key, "two-step", { u: s.userId, next }, 5 * 60_000) });
  return answer(200, { ok: true, next }, sessionCookie(s.token));
}
