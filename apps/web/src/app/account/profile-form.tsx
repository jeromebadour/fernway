"use client";
// The profile's fields. Saving says what it is doing and what happened (BUILD-RULES 2.6); changing the email opens a
// dialog (2.11), because a new address must be confirmed before it counts.
import { useMemo, useState } from "react";
import { Field } from "@/ui/field";
import { GCheck, GClock, GMail, GSave } from "@/ui/glyphs";
import { useNow } from "@/ui/use-now";

type P = { name: string; company: string; email: string; emailConfirmed: boolean; timeZone: string };

export function ProfileForm({ initial }: { initial: P }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [initial.timeZone]), [initial.timeZone]);
  const changed = v.name !== initial.name || v.company !== initial.company || v.timeZone !== initial.timeZone;
  const now = useNow();
  const nowThere = now === null ? "" : `${new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: v.timeZone })} there now`;

  return (
    <form className="fm ac-form" onSubmit={(e) => { e.preventDefault(); setState("saving"); setTimeout(() => setState("saved"), 500); }}>
      <div className="fm-fields">
        <Field kind="name" label="Name" half>
          <input value={v.name} maxLength={80} autoComplete="name" onChange={(e) => { setV({ ...v, name: e.target.value }); setState("idle"); }} />
        </Field>
        <Field kind="company" label="Company" half>
          <input value={v.company} maxLength={120} autoComplete="organization" onChange={(e) => { setV({ ...v, company: e.target.value }); setState("idle"); }} />
        </Field>
        <div className="fm-field">
          <span className="fm-label">Email</span>
          <div className="ac-email">
            <span className="fm-input fm-has-g ac-email-box"><span className="fm-g" aria-hidden="true"><GMail size={16} /></span><input value={v.email} disabled /></span>
            {v.emailConfirmed && <span className="ac-ok-tag"><GCheck size={13} />Confirmed</span>}
            <button type="button" className="wb-ghost fm-btn"><GMail size={16} />Change email</button>
          </div>
          <span className="fm-hint">A new address counts once you open the link sent to it.</span>
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
          {state === "idle" && changed && "Unsaved changes"}
        </span>
      </div>
    </form>
  );
}
