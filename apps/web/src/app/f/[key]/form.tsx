"use client";
// The embed form itself: the owner's chosen fields with Fernway's helping inputs, then a Sent panel with the waybill
// number and the visitor's own receipt. It tells the page around it how tall it is, so the frame never scrolls.
import { useEffect, useRef, useState } from "react";
import { Field, type FieldKind } from "@/ui/field";
import { emailTypo } from "@/ui/field-help";
import { GCheck, GClock, GOut, GResend, GRoute } from "@/ui/glyphs";

type K = "firstName" | "lastName" | "email" | "phone" | "companyName" | "message";
const spec: Record<K, { label: string; kind: FieldKind; type: string; placeholder: string; auto: string; max: number; half?: boolean; required?: boolean }> = {
  firstName: { label: "First name", kind: "name", type: "text", placeholder: "Lena", auto: "given-name", max: 80, half: true },
  lastName: { label: "Last name", kind: "name", type: "text", placeholder: "Hartmann", auto: "family-name", max: 80, half: true },
  email: { label: "Email", kind: "email", type: "email", placeholder: "lena@example.com", auto: "email", max: 200, required: true },
  phone: { label: "Phone", kind: "phone", type: "tel", placeholder: "503 555 0142", auto: "tel", max: 20 },
  companyName: { label: "Company", kind: "company", type: "text", placeholder: "Northpine Dental", auto: "organization", max: 120 },
  message: { label: "Message", kind: "message", type: "textarea", placeholder: "How can we help?", auto: "off", max: 2000 },
};

export function EmbedForm({ formKey, fields, button }: { formKey: string; fields: K[]; button: string }) {
  const blank = () => Object.fromEntries(fields.map((f) => [f, ""])) as Record<K, string>;
  const [v, setV] = useState<Record<K, string>>(blank);
  const [errors, setErrors] = useState<Partial<Record<K | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ number: string; track: string } | null>(null);
  const opened = useRef("");
  useEffect(() => { opened.current = crypto.randomUUID(); }, []);

  // Tell the page around the frame how tall the form is now (embed.js sizes the frame to it).
  useEffect(() => {
    if (window.parent === window) return;
    // The form's own height, not the document's: a document is never shorter than its frame, so it could only grow.
    const main = document.querySelector("main.em");
    if (!main) return;
    const tell = () => window.parent.postMessage({ fernway: "size", key: formKey, height: Math.ceil(main.getBoundingClientRect().height) }, "*");
    const ro = new ResizeObserver(tell);
    ro.observe(main);
    tell();
    return () => ro.disconnect();
  }, [formKey]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.email?.trim()) { setErrors({ email: "Needs your email." }); return; }
    setBusy(true); setErrors({});
    const trap = (new FormData(e.currentTarget).get("fax") as string) ?? "";
    const contact: Record<string, string> = { ...v };
    if (v.phone !== undefined) contact.phone = v.phone.trim() ? `+${v.phone.replace(/\D/g, "")}` : "";
    try {
      const r = await fetch(`/api/embed/${formKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opened: opened.current, trap, contact }) });
      const j = await r.json();
      if (!j.ok) {
        const out: Partial<Record<K | "form", string>> = {};
        for (const p of (j.problems as string[] | undefined) ?? ["something went wrong; send it again"]) {
          const m = p.match(/^contact\.(\w+): (.*)$/);
          if (m && fields.includes(m[1] as K)) out[m[1] as K] = `Needs ${m[2]}.`;
          else out.form = p.charAt(0).toUpperCase() + p.slice(1) + ".";
        }
        setErrors(out);
        return;
      }
      setSent({ number: j.number, track: j.track });
    } catch {
      setErrors({ form: "Couldn't send it. Check your connection and send it again; it won't be sent twice." });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="em-sent" role="status">
        <p className="em-stamp"><GCheck size={15} />Sent</p>
        <p className="em-label">Your waybill</p>
        <p className="em-number">{sent.number}</p>
        <p className="em-line">It&apos;s on its way. The receipt shows every step it takes, and stays open for 30 days.</p>
        <div className="em-do">
          <a className="em-go" href={sent.track} target="_blank" rel="noopener"><GOut size={15} />Watch it arrive</a>
          <button type="button" className="em-ghost" onClick={() => { setV(blank()); setSent(null); opened.current = crypto.randomUUID(); }}><GResend size={15} />Send another</button>
        </div>
      </section>
    );
  }

  const typo = v.email ? emailTypo(v.email) : null;
  return (
    <form className="fm em-form" onSubmit={send} noValidate>
      <div className="fm-trap" aria-hidden="true"><label>Fax<input name="fax" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="fm-fields">
        {fields.map((k) => {
          const f = spec[k];
          const half = f.half && fields.includes(k === "firstName" ? "lastName" : "firstName");
          const set = (x: string) => setV((o) => ({ ...o, [k]: x.slice(0, f.max) }));
          return (
            <Field key={k} kind={f.kind} label={f.label} half={half} area={f.type === "textarea"} bad={!!errors[k]} error={errors[k]}
              hint={f.type === "textarea" ? `${v[k].length} of ${f.max}` : f.required ? undefined : "Optional"}
              suggest={k === "email" && typo ? { text: <>Did you mean <b>{typo}</b>?</>, apply: () => set(typo) } : null}>
              {f.type === "textarea"
                ? <textarea value={v[k]} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} maxLength={f.max} />
                : <>{k === "phone" && <i>+</i>}<input type={f.type} value={v[k]} onChange={(e) => set(k === "phone" ? e.target.value.replace(/[^\d\s()-]/g, "") : e.target.value)}
                    placeholder={f.placeholder} autoComplete={f.auto} maxLength={f.max} required={f.required} spellCheck={k === "email" ? false : undefined} /></>}
            </Field>
          );
        })}
      </div>
      {errors.form && <p className="fm-error fm-error-form" role="alert">{errors.form}</p>}
      <button type="submit" className="em-go em-send" disabled={busy}>{busy ? <GClock size={16} /> : <GRoute size={16} />}{busy ? "Sending" : button}</button>
    </form>
  );
}
