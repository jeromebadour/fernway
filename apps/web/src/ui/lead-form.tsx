"use client";
// The public site's lead forms (Start a trial, Contact sales): the form on the left, the visitor's own waybill on the
// right. While they type, the waybill fills in; when they send it, it becomes the live receipt of their lead travelling
// into Fernway's GHL sandbox. Each form is the same component with its own fields and route.
import { useEffect, useRef, useState } from "react";
import type { TrackView } from "@fernway/delivery";
import { GRoute, GScan } from "@/ui/glyphs";
import { Receipt } from "@/ui/receipt";

type Key = "firstName" | "lastName" | "email" | "phone" | "companyName" | "website" | "message";
type Field = { key: Key; label: string; hint: string; type: "text" | "email" | "tel" | "url" | "textarea"; required?: boolean; placeholder: string;
  autoComplete: string; half?: boolean; pre?: string; clean?: (s: string) => string; max: number; called?: string };

// Each field helps as you type (BUILD-RULES, Kami 2026-11-10): what it takes, an example, and only what it can hold.
export const fieldSet: Record<Key, Field> = Object.fromEntries(([
  { key: "firstName", label: "First name", hint: "", type: "text", required: true, placeholder: "e.g. Lena", autoComplete: "given-name", half: true, max: 80 },
  { key: "lastName", label: "Last name", hint: "", type: "text", placeholder: "e.g. Hartmann", autoComplete: "family-name", half: true, max: 80 },
  { key: "email", label: "Work email", hint: "GHL matches your contact by this first", type: "email", required: true, placeholder: "e.g. lena@northpine.com",
    autoComplete: "email", max: 200, clean: (s) => s.replace(/\s/g, "") },
  { key: "phone", label: "Phone", hint: "Optional. With the country code, so GHL can match it too", type: "tel", placeholder: "503 555 0142",
    autoComplete: "tel", pre: "+", max: 20, clean: (s) => s.replace(/[^\d\s()-]/g, "").replace(/^\s+/, "") },
  { key: "companyName", label: "Company", hint: "", type: "text", required: true, placeholder: "e.g. Northpine Dental", autoComplete: "organization", max: 120 },
  { key: "website", label: "Website", hint: "Optional. Where your forms live today", type: "url", placeholder: "northpine.com", autoComplete: "url",
    pre: "https://", max: 200, clean: (s) => s.replace(/^https?:\/\//i, "").replace(/\s/g, "") },
  { key: "message", label: "What would you like to talk about?", hint: "Reaches GHL as a note on your contact", type: "textarea", required: true,
    placeholder: "e.g. We run 12 dental sites on WordPress and lose leads when GHL is slow.", autoComplete: "off", max: 2000, called: "a message" },
] as Field[]).map((f) => [f.key, f])) as Record<Key, Field>;

export type LeadFormSpec = {
  form: "trial" | "contact";
  fields: (Key | [Key, Partial<Field>])[];
  from: string;
  route: string;
  send: string;
};

/** "contact.email: a real email address" from the engine, as a message under the email field. */
function byField(problems: string[], fields: Field[]) {
  const out: Partial<Record<Key | "form", string>> = {};
  for (const p of problems) {
    const m = p.match(/^contact\.(\w+): (.*)$/);
    if (m && fields.some((f) => f.key === m[1])) out[m[1] as Key] = `Needs ${m[2]}.`;
    else if (p.startsWith("contact: ")) out.email = `Needs ${p.slice(9)}.`;
    else out.form = p.charAt(0).toUpperCase() + p.slice(1) + ".";
  }
  return out;
}

export function LeadForm({ spec }: { spec: LeadFormSpec }) {
  const fields = spec.fields.map((k) => (Array.isArray(k) ? { ...fieldSet[k[0]], ...k[1] } : fieldSet[k]));
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<Key, string>);
  const [errors, setErrors] = useState<Partial<Record<Key | "form", string>>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ token: string; view: TrackView } | null>(null);
  const key = useRef<string>("");
  useEffect(() => { key.current = crypto.randomUUID(); }, []);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const missing = fields.filter((f) => f.required && !v[f.key].trim());
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((f) => [f.key, `Needs ${f.called ?? `your ${f.label.toLowerCase()}`}.`])));
      return;
    }
    setSending(true);
    setErrors({});
    const trap = (new FormData(e.currentTarget).get("fax") as string) ?? "";
    const contact: Record<string, string> = { ...v };
    if (v.phone !== undefined) contact.phone = v.phone.trim() ? `+${v.phone.replace(/\D/g, "")}` : "";
    if (v.website !== undefined) contact.website = v.website.trim() ? `https://${v.website.trim()}` : "";
    try {
      const r = await fetch("/api/leads/site", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: spec.form, key: key.current, trap, contact }),
      });
      const j = await r.json();
      if (!j.ok) { setErrors(byField(j.problems ?? ["something went wrong; send it again"], fields)); return; }
      const token = String(j.track).replace("/track/", "");
      const t = await fetch(`/api/track/${token}`, { cache: "no-store" }).then((x) => x.json());
      setSent({ token, view: t.view });
      window.history.replaceState(null, "", `/track/${token}`);
      // On a phone the receipt is under the form: bring it into view so the visitor sees their lead start moving.
      requestAnimationFrame(() => {
        const side = document.querySelector(".fm-side");
        if (side && side.getBoundingClientRect().top > window.innerHeight * 0.6) side.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setErrors({ form: "Couldn't reach Fernway. Check your connection and send it again; it won't make a second lead." });
    } finally {
      setSending(false);
    }
  }

  const name = [v.firstName, v.lastName].filter(Boolean).join(" ");
  const steps = ["Picked up", "Checked", "Handed to GHL", ...(v.message !== undefined ? ["Message added as a note"] : []), "Signed for"];
  return (
    <div className="fm-grid">
      <form className="fm" onSubmit={send} noValidate>
        {/* Hidden from people; a bot that fills it in is turned away. */}
        <label className="fm-trap" aria-hidden="true">Fax<input name="fax" tabIndex={-1} autoComplete="off" /></label>
        <div className="fm-fields">
          {fields.map((f) => (
            <label key={f.key} className={f.half ? "fm-field fm-half" : "fm-field"}>
              <span className="fm-label">{f.label}{!f.required && <em>Optional</em>}</span>
              <span className={`fm-input${f.type === "textarea" ? " fm-area" : ""}${errors[f.key] ? " fm-bad" : ""}`}>
                {f.pre && <i>{f.pre}</i>}
                {f.type === "textarea" ? (
                  <textarea
                    name={f.key} required={f.required} placeholder={f.placeholder} maxLength={f.max} disabled={!!sent} rows={5}
                    value={v[f.key]} aria-invalid={!!errors[f.key]}
                    onChange={(e) => { setV({ ...v, [f.key]: e.target.value }); setErrors({ ...errors, [f.key]: undefined }); }}
                  />
                ) : (
                  <input
                    type={f.type} name={f.key} required={f.required} placeholder={f.placeholder} autoComplete={f.autoComplete}
                    maxLength={f.max} disabled={!!sent} inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined}
                    value={v[f.key]} aria-invalid={!!errors[f.key]}
                    onChange={(e) => { setV({ ...v, [f.key]: f.clean ? f.clean(e.target.value) : e.target.value }); setErrors({ ...errors, [f.key]: undefined }); }}
                  />
                )}
              </span>
              <span className="fm-under">
                {errors[f.key] ? <span className="fm-error">{errors[f.key]}</span> : f.hint ? <span className="fm-hint">{f.hint}</span> : <span />}
                {f.type === "textarea" && (
                  <span className={`fm-count${v[f.key].length > f.max * 0.9 ? " fm-count-near" : ""}`}>{v[f.key].length.toLocaleString("en-US")} / {f.max.toLocaleString("en-US")}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <p className="fm-note">Fernway is a portfolio product. What you send goes to its demo GoHighLevel account and is deleted after 30 days.</p>
        {errors.form && <p className="fm-error fm-error-form">{errors.form}</p>}
        {sent
          ? <p className="fm-sent"><GRoute size={16} />Sent. Your receipt stays at this page&rsquo;s address for 30 days.</p>
          : <button className="wb-go wb-go-lg fm-send" type="submit" disabled={sending}><GRoute />{sending ? "Sending…" : spec.send}</button>}
      </form>

      <div className="fm-side">
        {sent ? <Receipt initial={sent.view} token={sent.token} /> : (
          <article className="wb-bill rc-bill fm-preview" aria-label="Your waybill, before it is sent">
            <div className="wb-perf" aria-hidden="true" />
            <div className="wb-bill-head">
              <div><p className="wb-label">Waybill <span className="rc-yours">Yours</span></p><p className="wb-no">FW 26 ·····</p></div>
              <div className="wb-stamp rc-stamp fm-stamp-wait">Not sent yet</div>
            </div>
            <div className="wb-route">
              <div><p className="wb-label">From</p><p>Website<span>{spec.from}</span></p></div>
              <GRoute size={22} />
              <div><p className="wb-label">To</p><p>GoHighLevel<span>Fernway&rsquo;s sandbox · {spec.route}</span></p></div>
            </div>
            <div className="wb-consignee">
              <span className="wb-ava">{((v.firstName?.[0] ?? "") + (v.lastName?.[0] ?? "")).toUpperCase() || "··"}</span>
              <div>
                <p className="wb-name">{name || <span className="fm-ghost">Your name</span>}</p>
                <p className="wb-org">{v.companyName || "Your company"}</p>
              </div>
            </div>
            <ol className="wb-scans fm-ghost-scans">
              {steps.map((w) => (
                <li key={w}><span className="wb-t">··:··:··</span><span className="wb-node"><GScan size={14} /></span><span className="wb-what">{w}</span></li>
              ))}
            </ol>
          </article>
        )}
      </div>
    </div>
  );
}
