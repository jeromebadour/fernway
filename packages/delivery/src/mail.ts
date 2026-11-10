// Email: Fernway's letter (a title, a line or two, one button, the link written out for plain text) and sending it
// through Resend as noreply@jeromebadour.com, or into an outbox where a test can read it (local work and CI).
export type Mail = { to: string; subject: string; text: string; html: string };
export type Mailer = (m: Mail) => Promise<{ ok: boolean; why?: string }>;

/** Resend with this key; or the outbox; or null when neither is set up (nothing pretends to send). */
export function mailer(o: { resendKey?: string; outbox?: (m: Mail) => Promise<void> }): Mailer | null {
  if (o.resendKey) {
    return async (m) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${o.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Fernway <noreply@jeromebadour.com>", to: [m.to], subject: m.subject, text: m.text, html: m.html }),
        signal: AbortSignal.timeout(10_000),
      }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }));
      return res.ok ? { ok: true } : { ok: false, why: `Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
    };
  }
  if (o.outbox) return async (m) => { await o.outbox!(m); return { ok: true }; };
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A short message in Fernway's look: a title, a line or two, one button, and the link written out for plain text. */
export function letter(o: { to: string; subject: string; title: string; lines: string[]; button: string; url: string; foot: string; rows?: [string, string][] }): Mail {
  const rows = o.rows ?? [];
  const width = Math.max(0, ...rows.map(([k]) => k.length));
  const text = [o.title, "", ...o.lines, ...(rows.length ? ["", ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`)] : []), "", `${o.button}: ${o.url}`, "", o.foot, "", "Fernway, lead delivery for GoHighLevel. Built by Jerome Badour."].join("\n");
  // The facts as a small waybill: each label in mono capitals beside its value, dashed rules between.
  const table = rows.length === 0 ? "" : `<table role="presentation" width="100%" style="margin:8px 0 6px;border:1px solid #233246;border-collapse:collapse">${rows.map(([k, v]) =>
    `<tr><td style="padding:10px 14px;border-bottom:1px dashed #233246;font:600 11px/1.4 monospace;letter-spacing:1.5px;text-transform:uppercase;color:#a9b6c6;white-space:nowrap;width:1%">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px dashed #233246;font:500 14px/1.5 monospace;color:#eef2f6">${esc(v)}</td></tr>`).join("")}</table>`;
  const html = `<!doctype html><html><body style="margin:0;background:#0a1019;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#eef2f6">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#0e1621;border:1px solid #233246">
<tr><td style="padding:22px 28px;border-bottom:1px dashed #233246;font:600 13px/1 monospace;letter-spacing:3px;color:#5cc8b8">FERNWAY</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#eef2f6">${esc(o.title)}</h1>
${o.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#cfd8e3">${esc(l)}</p>`).join("")}
${table}
<p style="margin:22px 0"><a href="${esc(o.url)}" style="display:inline-block;padding:13px 22px;background:#5cc8b8;color:#04211d;font-weight:600;text-decoration:none">${esc(o.button)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#a9b6c6">${esc(o.foot)}</p>
<p style="margin:14px 0 0;font:12px monospace;color:#7f8da0;word-break:break-all">${esc(o.url)}</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px dashed #233246;font-size:12px;color:#7f8da0">Lead delivery for GoHighLevel. Built by Jerome Badour.</td></tr>
</table></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}
