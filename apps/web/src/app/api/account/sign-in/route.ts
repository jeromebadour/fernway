import { signIn } from "@fernway/delivery";
import { answer, gate, ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { deviceOf, safeNext, sessionCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Signing in: 10 tries an hour per visitor and per email, the same answer for a wrong email and a wrong password.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const email = String(g.body.email ?? "").trim().toLowerCase();
  if (!(await within(`signin:ip:${ip(request)}`, 20)) || !(await within(`signin:email:${email}`, 10))) {
    return answer(429, { ok: false, problems: ["form: too many tries in an hour; wait, or reset the password"] });
  }
  const s = await signIn(delivery().db, email, String(g.body.password ?? ""), deviceOf(request.headers.get("user-agent")));
  if (!s) return answer(401, { ok: false, problems: ["form: that email and password don't match an account"] });
  return answer(200, { ok: true, next: safeNext(String(g.body.next ?? "")) }, sessionCookie(s.token));
}
