import { acceptInvite, openSession } from "@fernway/delivery";
import { answer, gate, ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { deviceOf, sessionCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// Joining a team through an invite link: the person is made with the invited email and role, then signed in.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  if (!(await within(`join:ip:${ip(request)}`, 10))) return answer(429, { ok: false, problems: ["form: too many tries from one visitor in an hour; try again later"] });
  const { token, ...input } = g.body;
  const { db } = delivery();
  const r = await acceptInvite(db, String(token ?? ""), input);
  if (!r.ok) return answer(r.problems.some((p) => p.startsWith("form:")) ? 410 : 422, r);
  const session = await openSession(db, r.userId, deviceOf(request.headers.get("user-agent")));
  return answer(201, { ok: true, next: "/console?done=joined" }, sessionCookie(session));
}
