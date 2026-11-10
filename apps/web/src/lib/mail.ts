import "server-only";
import { redis } from "./redis";

// Sending email. With RESEND_API_KEY set, through Resend as noreply@jeromebadour.com (the domain is verified there for
// Distill already). Without it, a run that asks for an outbox (FERNWAY_MAIL_OUTBOX=on: local work and CI) keeps the
// message in Redis so a test can open its link; anything else refuses to pretend it sent.
export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(m: Mail): Promise<{ ok: boolean; why?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Fernway <noreply@jeromebadour.com>", to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
    return res.ok ? { ok: true } : { ok: false, why: `Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  if (process.env.FERNWAY_MAIL_OUTBOX === "on") {
    await redis().multi().lpush("fernway:outbox", JSON.stringify({ ...m, at: new Date().toISOString() })).ltrim("fernway:outbox", 0, 99).exec();
    return { ok: true };
  }
  return { ok: false, why: "no way to send email is set up (RESEND_API_KEY)" };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A short message in Fernway's look: a title, a line or two, one button, and the link written out for plain text. */
export function letter(o: { to: string; subject: string; title: string; lines: string[]; button: string; url: string; foot: string }): Mail {
  const text = [o.title, "", ...o.lines, "", `${o.button}: ${o.url}`, "", o.foot, "", "Fernway, lead delivery for GoHighLevel. Built by Jerome Badour."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#0a1019;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#eef2f6">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#0e1621;border:1px solid #233246">
<tr><td style="padding:22px 28px;border-bottom:1px dashed #233246;font:600 13px/1 monospace;letter-spacing:3px;color:#5cc8b8">FERNWAY</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#eef2f6">${esc(o.title)}</h1>
${o.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#cfd8e3">${esc(l)}</p>`).join("")}
<p style="margin:22px 0"><a href="${esc(o.url)}" style="display:inline-block;padding:13px 22px;background:#5cc8b8;color:#04211d;font-weight:600;text-decoration:none">${esc(o.button)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#a9b6c6">${esc(o.foot)}</p>
<p style="margin:14px 0 0;font:12px monospace;color:#7f8da0;word-break:break-all">${esc(o.url)}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px dashed #233246;font-size:12px;color:#7f8da0">Lead delivery for GoHighLevel. Built by Jerome Badour.</td></tr>
</table></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}
