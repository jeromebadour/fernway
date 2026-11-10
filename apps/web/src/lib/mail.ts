import "server-only";
import { letter, mailer, type Mail } from "@fernway/delivery";
import { redis } from "./redis";

// Sending email from the web app (sign-up, reset): Resend when RESEND_API_KEY is set; otherwise, when a run asks for
// an outbox (FERNWAY_MAIL_OUTBOX=on: local work and CI), Redis keeps the message so a test can open its link.
export { letter, type Mail };

export const outbox = async (m: Mail) => {
  await redis().multi().lpush("fernway:outbox", JSON.stringify({ ...m, at: new Date().toISOString() })).ltrim("fernway:outbox", 0, 99).exec();
};

export async function sendMail(m: Mail): Promise<{ ok: boolean; why?: string }> {
  const send = mailer({ resendKey: process.env.RESEND_API_KEY, outbox: process.env.FERNWAY_MAIL_OUTBOX === "on" ? outbox : undefined });
  return send ? send(m) : { ok: false, why: "no way to send email is set up (RESEND_API_KEY)" };
}
