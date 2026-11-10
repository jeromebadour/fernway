import { resendConfirm } from "@fernway/delivery";
import { answer, appUrl, gate } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { letter, sendMail } from "@/lib/mail";
import { currentPerson, within } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const p = await currentPerson();
  if (!p) return answer(401, { ok: false, problems: ["form: sign in first"] });
  if (p.emailConfirmed) return answer(200, { ok: true, already: true });
  if (!(await within(`confirm:user:${p.userId}`, 3))) return answer(429, { ok: false, problems: ["form: three links in an hour is the most; check your inbox and spam folder"] });
  const token = await resendConfirm(delivery().db, p.userId);
  const sent = await sendMail(letter({
    to: p.email, subject: "Confirm your email for Fernway", title: "Confirm your email",
    lines: ["Here is a fresh link to confirm this address for your Fernway account."], button: "Confirm my email",
    url: `${appUrl()}/confirm/${token}`, foot: "The link works once, for 48 hours.",
  }));
  return sent.ok ? answer(200, { ok: true }) : answer(503, { ok: false, problems: ["form: the email could not be sent right now; try again in a minute"] });
}
