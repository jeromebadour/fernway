import { INVITE_DAYS, invite } from "@fernway/delivery";
import { appUrl } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { answer, manager, outcome } from "@/lib/console-api";
import { letter, sendMail } from "@/lib/mail";
import { within } from "@/lib/session";

export const dynamic = "force-dynamic";

// An invite by email to join the team. Only from a confirmed address; 20 an hour per account.
export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  if (!(await within(`invite:${s.m.accountId}`, 20))) return answer(429, { ok: false, problems: ["email: too many invites this hour; wait, then try again"] });
  const r = await invite(delivery().db, s.m, s.body);
  if (!r.ok) return outcome(r);
  const email = String(s.body.email).trim().toLowerCase();
  const role = s.body.role === "admin" ? "an admin" : "a member";
  const sent = await sendMail(letter({
    to: email, subject: `${s.m.name} invited you to Fernway`,
    title: "You're invited to a Fernway team",
    lines: [`${s.m.name} invited you to join their team on Fernway as ${role}.`, "Fernway delivers website leads into GoHighLevel and shows where every one is."],
    button: "Join the team", url: `${appUrl()}/join/${r.token}`,
    foot: `The link works once, for ${INVITE_DAYS} days. If you weren't expecting this, ignore it and nothing happens.`,
  }));
  if (!sent.ok) console.error(`invite: email not sent: ${sent.why}`);
  return answer(201, { ok: true, id: r.id, emailSent: sent.ok });
}
