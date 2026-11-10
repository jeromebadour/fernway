"use client";
// The profile's fields. Saving says what it is doing and what happened (BUILD-RULES 2.6); changing the email opens a
// dialog (2.11), because a new address must be confirmed before it counts.
import { useMemo, useState } from "react";
import { Field } from "@/ui/field";
import { GCheck, GClock, GMail, GSave } from "@/ui/glyphs";
import { useNow } from "@/ui/use-now";

type P = { name: string; company: string; email: string; emailConfirmed: boolean; timeZone: string };

export function ProfileForm({ initial, owner }: { initial: P; owner: boolean }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [initial.timeZone]), [initial.timeZone]);
  const changed = v.name !== saved.name || v.company !== saved.company || v.timeZone !== saved.timeZone;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving"); setProblem(null);
    const body = { name: v.name, timeZone: v.timeZone, ...(owner ? { company: v.company } : {}) };
    const r = await fetch("/api/account/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json()).catch(() => ({ ok: false, problems: ["form: Fernway could not be reached"] })) as { ok?: boolean; problems?: string[] };
    if (r.ok) { setSaved(v); setState("saved"); return; }
    setProblem((r.problems?.[0] ?? "Something went wrong").replace(/^[a-zA-Z]+: /, "").replace(/^./, (c) => c.toUpperCase()));
    setState("failed");
  }
  const now = useNow();
  const nowThere = now === null ? "" : `${new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: v.timeZone })} there now`;

  return (
    <form className="fm ac-form" onSubmit={save} noValidate>
      <div className="fm-fields">
        <Field kind="name" label="Name" half>
          <input value={v.name} maxLength={80} autoComplete="name" onChange={(e) => { setV({ ...v, name: e.target.value }); setState("idle"); }} />
        </Field>
        <Field kind="company" label="Company" half hint={owner ? undefined : "The account's owner names the company."}>
          <input value={v.company} disabled={!owner} maxLength={120} autoComplete="organization" onChange={(e) => { setV({ ...v, company: e.target.value }); setState("idle"); }} />
        </Field>
        <div className="fm-field">
          <span className="fm-label">Email</span>
          <div className="ac-email">
            <span className="fm-input fm-has-g ac-email-box"><span className="fm-g" aria-hidden="true"><GMail size={16} /></span><input value={v.email} disabled /></span>
            {v.emailConfirmed ? <span className="ac-ok-tag"><GCheck size={13} />Confirmed</span> : <ConfirmAgain />}
          </div>
        </div>
        <Field kind="zone" label="Time zone" aside={<em>{nowThere}</em>} half hint="Receipts, the console and emails use it.">
          <span className="ac-select">
            <select value={v.timeZone} onChange={(e) => { setV({ ...v, timeZone: e.target.value }); setState("idle"); }}>
              {zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
            </select>
          </span>
        </Field>
      </div>
      <div className="ac-save">
        <button type="submit" className="wb-go fm-btn" disabled={!changed || state === "saving"}><GSave size={16} />Save changes</button>
        <span className="ac-save-state" role="status">
          {state === "saving" && <><GClock size={14} />Saving</>}
          {state === "saved" && <><GCheck size={14} />Saved</>}
          {state === "failed" && <span className="fm-error">{problem}</span>}
          {state === "idle" && changed && "Unsaved changes"}
        </span>
      </div>
    </form>
  );
}

/** An unconfirmed email: one press sends a fresh link, and says so. */
function ConfirmAgain() {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [why, setWhy] = useState("");
  return (
    <span className="ac-confirm">
      <span className="ac-wait-tag"><GClock size={13} />Not confirmed</span>
      {state === "sent" ? <span className="ac-save-state"><GCheck size={14} />Link sent</span> : (
        <button type="button" className="wb-ghost fm-btn" disabled={state === "busy"} onClick={async () => {
          setState("busy");
          const r = await fetch("/api/account/confirm-again", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((x) => x.json()).catch(() => ({ ok: false })) as { ok?: boolean; problems?: string[] };
          if (r.ok) setState("sent"); else { setWhy((r.problems?.[0] ?? "Not sent").replace(/^form: /, "")); setState("failed"); }
        }}><GMail size={16} />{state === "busy" ? "Sending" : "Send the link again"}</button>
      )}
      {state === "failed" && <span className="fm-error">{why}</span>}
    </span>
  );
}
