import { requestReset } from "@fernway/delivery";
import { answer, appUrl, gate, ip } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { letter, sendMail } from "@/lib/mail";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// The same answer whether the email has an account or not, so the page tells no one who signed up.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const email = String(g.body.email ?? "").trim().toLowerCase();
  if (!(await within(`reset:ip:${ip(request)}`, 10)) || !(await within(`reset:email:${email}`, 3))) {
    return answer(429, { ok: false, problems: ["form: that's the most reset links in an hour; check your inbox, or try later"] });
  }
  const r = await requestReset(delivery().db, email);
  if (r) {
    const sent = await sendMail(letter({
      to: email, subject: "Reset your Fernway password",
      title: "Set a new password", lines: ["Someone asked to reset the password of the Fernway account at this address."],
      button: "Set a new password", url: `${appUrl()}/reset/${r.token}`,
      foot: "The link works once, for one hour, and signs you out on every device. If it wasn't you, ignore this email: your password stays as it is.",
    }));
    if (!sent.ok) console.error(`reset: email not sent: ${sent.why}`);
  }
  return answer(200, { ok: true });
}
