"use client";
// Making, changing and revoking an embed form, each in a dialog; and the form's code with a copy button. A form names
// one route (routes with a calendar are left out: a form has no time picker), the fields it asks for (email always,
// GHL matches contacts by it), its look, its button and the sites allowed to show it.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GCheck, GClock, GClose, GCopy, GEye, GPlus, GSave, GSliders, GTrash, GWidget } from "@/ui/glyphs";

type FieldKey = "firstName" | "lastName" | "email" | "phone" | "companyName" | "message";
type Theme = "light" | "dark" | "auto";
export type FormDraft = { id?: number; label: string; routeKey: string; fields: FieldKey[]; theme: Theme; button: string; sites: string[] };
type RouteChoice = { key: string; label: string };

const allFields: { k: FieldKey; w: string }[] = [
  { k: "firstName", w: "First name" }, { k: "lastName", w: "Last name" }, { k: "email", w: "Email" },
  { k: "phone", w: "Phone" }, { k: "companyName", w: "Company" }, { k: "message", w: "Message" },
];
const themes: { k: Theme; w: string }[] = [{ k: "light", w: "Light" }, { k: "dark", w: "Dark" }, { k: "auto", w: "Follows the visitor" }];


export function FormMake({ routes }: { routes: RouteChoice[] }) {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  const blank: FormDraft = { label: "", routeKey: routes[0]?.key ?? "", fields: ["firstName", "email", "message"], theme: "light", button: "Send", sites: [] };
  return (
    <>
      <button type="button" className="wb-go fm-btn" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GPlus size={16} />Make a form</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="ef-make-h"><FormDialog key={n} id="ef-make-h" start={blank} routes={routes} close={() => d.current?.close()} /></dialog>
    </>
  );
}

export function FormEdit({ form, routes }: { form: FormDraft; routes: RouteChoice[] }) {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" className="rt-change" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GSliders size={14} />Change</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby={`ef-h-${form.id}`}><FormDialog key={n} id={`ef-h-${form.id}`} start={form} routes={routes} close={() => d.current?.close()} /></dialog>
    </>
  );
}

function FormDialog({ id, start, routes, close }: { id: string; start: FormDraft; routes: RouteChoice[]; close: () => void }) {
  const router = useRouter();
  const making = start.id === undefined;
  const [label, setLabel] = useState(start.label);
  const [routeKey, setRouteKey] = useState(start.routeKey);
  const [fields, setFields] = useState<FieldKey[]>(start.fields);
  const [theme, setTheme] = useState<Theme>(start.theme);
  const [button, setButton] = useState(start.button);
  const [sites, setSites] = useState(start.sites.join("\n"));
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  // A route the form names that isn't in the choices any more is kept as it is, and shown as such.
  const choices = routes.some((r) => r.key === start.routeKey) || !start.routeKey ? routes : [{ key: start.routeKey, label: "no longer a route" }, ...routes];

  const toggle = (k: FieldKey) => k !== "email" && setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblems({});
    const body = { ...(making ? {} : { id: start.id }), label, routeKey, fields, theme, button, sites: sites.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) };
    const r = await fetch("/api/console/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { close(); router.refresh(); return; }
    const p: Record<string, string> = {};
    for (const line of r?.problems ?? ["form: Fernway could not be reached"]) {
      const [f, ...rest] = line.split(": ");
      p[f!] ??= rest.join(": ").replace(/^./, (c) => c.toUpperCase());
    }
    setProblems(p);
  }

  return (
    <form onSubmit={save} noValidate>
      <h2 id={id}>{making ? "Make an embed form" : `Change ${start.label}`}</h2>
      <p>{making ? "Name it after the site or funnel it goes on. Its code stays the same once made, so changing it later needs no new code." : "Pages already carrying it show the change on their next load. Its code stays the same."}</p>
      <div className="fm rt-fields">
        <Field kind="route" label="Name" bad={!!problems.label} error={problems.label} hint={`${label.length} of 80`}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Clinic website" autoFocus />
        </Field>
        <Field kind="message" label="Button" bad={!!problems.button} error={problems.button} hint={`${button.length} of 30`}>
          <input value={button} onChange={(e) => setButton(e.target.value)} maxLength={30} placeholder="Request a booking" />
        </Field>
      </div>
      <fieldset className="ef-pick">
        <legend className="fm-label">Its leads take the route</legend>
        {choices.length === 0 ? <p className="fm-error">No route without a calendar yet. Make one under Routes first.</p> : choices.map((r) => (
          <label key={r.key} className={`ef-chip${routeKey === r.key ? " ef-on" : ""}`}>
            <input type="radio" name="route" value={r.key} checked={routeKey === r.key} onChange={() => setRouteKey(r.key)} />
            <code>{r.key}</code>{r.label}
          </label>
        ))}
        {problems.routeKey && <p className="fm-error">{problems.routeKey}</p>}
      </fieldset>
      <fieldset className="ef-pick">
        <legend className="fm-label">It asks for</legend>
        {allFields.map((f) => (
          <label key={f.k} className={`ef-chip${fields.includes(f.k) ? " ef-on" : ""}${f.k === "email" ? " ef-fixed" : ""}`} title={f.k === "email" ? "Always asked: GHL matches the contact by it" : undefined}>
            <input type="checkbox" checked={fields.includes(f.k)} disabled={f.k === "email"} onChange={() => toggle(f.k)} />
            {fields.includes(f.k) ? <GCheck size={13} /> : <GPlus size={13} />}{f.w}
          </label>
        ))}
        {problems.fields && <p className="fm-error">{problems.fields}</p>}
      </fieldset>
      <fieldset className="ef-pick">
        <legend className="fm-label">Look</legend>
        {themes.map((t) => (
          <label key={t.k} className={`ef-chip${theme === t.k ? " ef-on" : ""}`}>
            <input type="radio" name="theme" value={t.k} checked={theme === t.k} onChange={() => setTheme(t.k)} />
            <GEye size={13} />{t.w}
          </label>
        ))}
      </fieldset>
      <div className="fm ef-sites">
        <Field kind="website" area label="Shown only on these sites" bad={!!problems.sites} error={problems.sites} hint="One per line; *.example.com for every subdomain. Empty: any site">
          <textarea value={sites} onChange={(e) => setSites(e.target.value)} rows={3} placeholder={"harborphysio.com\n*.harborphysio.com"} spellCheck={false} autoCapitalize="none" />
        </Field>
      </div>
      {problems.form && <p className="fm-error" role="alert">{problems.form}</p>}
      {said && <DemoSaid what={<>the form is saved, its code is ready to copy, and the change is written to the audit log.</>} />}
      <div className="fm-dialog-do">
        <button type="submit" className="wb-go fm-btn" disabled={busy || !label.trim() || !routeKey}>{busy ? <GClock size={16} /> : making ? <GPlus size={16} /> : <GSave size={16} />}{busy ? "Saving" : making ? "Make the form" : "Save the form"}</button>
        <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={close}><GClose size={16} />Not now</button>
      </div>
    </form>
  );
}

export function FormRevoke({ id, label }: { id: number; label: string }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="ky-revoke" onClick={() => d.current?.showModal()}><GTrash size={14} />Revoke</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby={`ef-rv-${id}`}>
        <h2 id={`ef-rv-${id}`}>Revoke {label}?</h2>
        <p>Every page carrying this form shows it closed at once, and it takes no more leads. Leads it already sent stay as they are. This can&apos;t be undone; a new form gets new code.</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>the form closes on every page at once and the revoke is written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
            if (demo) { setSaid(true); return; }
            setBusy(true);
            const r = await fetch("/api/console/forms/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then((x) => x.json()).catch(() => null);
            setBusy(false);
            if (r?.ok) { d.current?.close(); router.refresh(); } else setProblem("Fernway could not revoke it just now. Try again.");
          }}>{busy ? <GClock size={16} /> : <GTrash size={16} />}Revoke the form</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GWidget size={16} />Keep it</button>
        </div>
      </dialog>
    </>
  );
}

/** The form's code, as pasted into a page or a GHL funnel's custom code block, with a copy button and a preview. */
export function Snippet({ app, formKey }: { app: string; formKey: string }) {
  const code = `<div data-fernway-form="${formKey}"></div>\n<script src="${app}/embed.js" async></script>`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="ef-code">
      <pre aria-label="The form's code"><code>{code}</code></pre>
      <div className="ef-code-do">
        <button type="button" className="wb-go fm-btn" onClick={async () => { await navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
          {copied ? <GCheck size={15} /> : <GCopy size={15} />}{copied ? "Code copied" : "Copy the code"}
        </button>
        <a className="wb-ghost fm-btn" href={`/f/${formKey}?preview=1`} target="_blank" rel="noopener"><GEye size={15} />Preview</a>
      </div>
    </div>
  );
}
