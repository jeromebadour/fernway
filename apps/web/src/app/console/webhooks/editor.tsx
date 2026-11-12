"use client";
// Webhook endpoints: made and changed in a dialog (its secret shown once, right after it is made), sent a test, and
// removed; and a failed delivery sent again.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GCheck, GClock, GClose, GCopy, GKey, GPlay, GPlus, GResend, GSave, GSignal, GSliders, GTrash } from "@/ui/glyphs";

export const eventChoices: { k: string; w: string }[] = [
  { k: "lead.picked_up", w: "Picked up" }, { k: "lead.signed", w: "Signed for" }, { k: "lead.held", w: "Held" },
  { k: "lead.returned", w: "Returned" }, { k: "lead.scored", w: "Scored" },
];
export type HookDraft = { id?: number; label: string; url: string; events: string[] };

async function call(path: string, body: object) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((x) => x.json()).catch(() => null) as Promise<{ ok?: boolean; problems?: string[]; secret?: string; delivered?: boolean; status?: number | null; answer?: string; ms?: number } | null>;
}

export function HookMake() {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" className="wb-go fm-btn" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GPlus size={16} />Add an endpoint</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="wh-make-h"><HookDialog key={n} id="wh-make-h" start={{ label: "", url: "", events: ["lead.signed", "lead.held"] }} close={() => d.current?.close()} /></dialog>
    </>
  );
}

export function HookEdit({ hook }: { hook: HookDraft }) {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" className="rt-change" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GSliders size={14} />Change</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby={`wh-h-${hook.id}`}><HookDialog key={n} id={`wh-h-${hook.id}`} start={hook} close={() => d.current?.close()} /></dialog>
    </>
  );
}

function HookDialog({ id, start, close }: { id: string; start: HookDraft; close: () => void }) {
  const router = useRouter();
  const demo = useDemo();
  const making = start.id === undefined;
  const [label, setLabel] = useState(start.label);
  const [url, setUrl] = useState(start.url);
  const [events, setEvents] = useState<string[]>(start.events);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblems({});
    const r = await call("/api/console/hooks", { ...(making ? {} : { id: start.id }), label, url, events });
    setBusy(false);
    if (r?.ok) { router.refresh(); if (r.secret) setSecret(r.secret); else close(); return; }
    const p: Record<string, string> = {};
    for (const line of r?.problems ?? ["form: Fernway could not be reached"]) { const [f, ...rest] = line.split(": "); p[f!] ??= rest.join(": ").replace(/^./, (c) => c.toUpperCase()); }
    setProblems(p);
  }

  if (secret) return (
    <div>
      <h2 id={id}>Copy its secret now</h2>
      <p>Your endpoint checks every call with this secret. Fernway shows it this once and keeps it sealed; a lost secret means a new endpoint.</p>
      <div className="wh-secret"><GKey size={16} /><code>{secret}</code></div>
      <div className="fm-dialog-do">
        <button type="button" className="wb-go fm-btn" onClick={async () => { await navigator.clipboard.writeText(secret).catch(() => {}); setCopied(true); }}>{copied ? <GCheck size={16} /> : <GCopy size={16} />}{copied ? "Copied" : "Copy the secret"}</button>
        <button type="button" className="wb-ghost fm-btn" onClick={close}><GCheck size={16} />I saved it</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={save} noValidate>
      <h2 id={id}>{making ? "Add an endpoint" : `Change ${start.label}`}</h2>
      <p>{making ? "Fernway POSTs each event you pick to this address, signed with a secret of its own." : "The secret stays the same."}</p>
      <div className="fm rt-fields">
        <Field kind="route" label="Name" bad={!!problems.label} error={problems.label} hint={`${label.length} of 80`}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="n8n lead flow" autoFocus />
        </Field>
      </div>
      <div className="fm wh-url">
        <Field kind="website" label="Address" bad={!!problems.url} error={problems.url} hint="https, public; Fernway refuses private networks">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/fernway" spellCheck={false} autoCapitalize="none" />
        </Field>
      </div>
      <fieldset className="ef-pick">
        <legend className="fm-label">It hears about</legend>
        {eventChoices.map((ev) => (
          <label key={ev.k} className={`ef-chip${events.includes(ev.k) ? " ef-on" : ""}`}>
            <input type="checkbox" checked={events.includes(ev.k)} onChange={() => setEvents((x) => (x.includes(ev.k) ? x.filter((y) => y !== ev.k) : [...x, ev.k]))} />
            {events.includes(ev.k) ? <GCheck size={13} /> : <GPlus size={13} />}{ev.w}
          </label>
        ))}
        {problems.events && <p className="fm-error">{problems.events}</p>}
      </fieldset>
      {problems.form && <p className="fm-error" role="alert">{problems.form}</p>}
      {said && <DemoSaid what={<>the endpoint is saved, its secret shown once, and the change written to the audit log.</>} />}
      <div className="fm-dialog-do">
        <button type="submit" className="wb-go fm-btn" disabled={busy || !label.trim() || !url.trim() || events.length === 0}>{busy ? <GClock size={16} /> : making ? <GPlus size={16} /> : <GSave size={16} />}{busy ? "Saving" : making ? "Add the endpoint" : "Save"}</button>
        <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={close}><GClose size={16} />Not now</button>
      </div>
    </form>
  );
}

export function HookTest({ id, label }: { id: number; label: string }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<{ delivered?: boolean; status?: number | null; answer?: string; ms?: number; problems?: string[] } | null>(null);
  return (
    <>
      <button type="button" className="rt-change" onClick={async () => {
        setR(null); d.current?.showModal();
        if (demo) return;
        setBusy(true);
        setR((await call("/api/console/hooks/test", { id })) ?? { problems: ["Fernway could not be reached"] });
        setBusy(false); router.refresh();
      }}><GPlay size={14} />Send a test</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby={`wh-t-${id}`}>
        <h2 id={`wh-t-${id}`}>A test to {label}</h2>
        {demo ? <DemoSaid what={<>Fernway sends a signed fernway.test event now, and shows what the endpoint answered.</>} />
          : busy ? <p className="wh-wait"><GClock size={16} />Sending, and waiting up to 10 s for an answer.</p>
          : r?.problems ? <p className="fm-error">{r.problems[0]}</p>
          : r && (
            <>
              <p className={r.delivered ? "wh-ok" : "wh-no"}>{r.delivered ? <GCheck size={16} /> : <GClose size={16} />}{r.delivered ? `Delivered: ${r.status}, in ${r.ms} ms.` : `Not delivered: ${r.status ?? "no answer"}${r.ms ? `, after ${r.ms} ms` : ""}.`}</p>
              {r.answer && <pre className="wh-pre">{r.answer}</pre>}
            </>
          )}
        <div className="fm-dialog-do"><button type="button" className="wb-ghost fm-btn" onClick={() => d.current?.close()}><GClose size={16} />Close</button></div>
      </dialog>
    </>
  );
}

export function HookRemove({ id, label }: { id: number; label: string }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="ky-revoke" onClick={() => { setSaid(false); setProblem(null); d.current?.showModal(); }}><GTrash size={14} />Remove</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby={`wh-rm-${id}`}>
        <h2 id={`wh-rm-${id}`}>Remove {label}?</h2>
        <p>Fernway stops calling it at once, and its deliveries go with it. This can&apos;t be undone; a new endpoint gets a new secret.</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>the endpoint is removed with its deliveries, and the change written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
            if (demo) { setSaid(true); return; }
            setBusy(true);
            const r = await call("/api/console/hooks/remove", { id });
            setBusy(false);
            if (r?.ok) { d.current?.close(); router.refresh(); } else setProblem("Fernway could not remove it just now. Try again.");
          }}>{busy ? <GClock size={16} /> : <GTrash size={16} />}Remove the endpoint</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GSignal size={16} />Keep it</button>
        </div>
      </dialog>
    </>
  );
}

export function DeliveryResend({ id }: { id: number }) {
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="cn-resend" disabled={busy || done} onClick={async () => {
      if (demo) { setDone(true); return; }
      setBusy(true);
      const r = await call("/api/console/hooks/resend", { id });
      setBusy(false);
      if (r?.ok) { setDone(true); router.refresh(); }
    }}>{busy ? <GClock size={14} /> : done ? <GCheck size={14} /> : <GResend size={14} />}{done ? (demo ? "Would resend" : "Resending") : "Resend"}</button>
  );
}
