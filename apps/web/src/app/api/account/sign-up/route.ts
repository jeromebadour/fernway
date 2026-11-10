import { signIn, signUp } from "@fernway/delivery";
import { answer, appUrl, gate, ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { letter, sendMail } from "@/lib/mail";
import { deviceOf, sessionCookie, within } from "@/lib/session";

export const dynamic = "force-dynamic";

// A new account: made, signed in at once, and a confirm link sent to the address.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  if (!(await within(`signup:ip:${ip(request)}`, 5))) return answer(429, { ok: false, problems: ["form: that's the most new accounts from one visitor in an hour; try again later"] });
  const { db } = delivery();
  const r = await signUp(db, g.body);
  if (!r.ok) return answer(r.problems.some((p) => p.startsWith("email: already")) ? 409 : 422, r);
  const email = String(g.body.email).trim().toLowerCase();
  const sent = await sendMail(letter({
    to: email, subject: "Confirm your email for Fernway",
    title: "One step: confirm your email",
    lines: [`Welcome to Fernway, ${String(g.body.name).trim()}. Your 14-day trial has started.`, "Confirm this address so Fernway can tell you when a lead is held or returned."],
    button: "Confirm my email", url: `${appUrl()}/confirm/${r.confirmToken}`,
    foot: "The link works once, for 48 hours. If you didn't start a trial, ignore this email and nothing happens.",
  }));
  if (!sent.ok) console.error(`sign-up: confirm email not sent: ${sent.why}`);
  const s = await signIn(db, email, String(g.body.password), deviceOf(request.headers.get("user-agent")));
  return answer(201, { ok: true, next: "/account?done=welcome", emailSent: sent.ok }, s ? sessionCookie(s.token) : undefined);
}
