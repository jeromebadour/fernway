"use client";
// Making and changing a route, in a dialog: its key (fixed once made), its name, the contact's tags, and from GHL's
// own lists the stage it lands in and the calendar a picked time is booked on. Saving reads the page again.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GClock, GClose, GPlus, GSave, GSliders } from "@/ui/glyphs";

export type RouteForm = { id?: number; key: string; label: string; tags: string[]; pipelineId: string | null; stageId: string | null; calendarId: string | null };
type Lists = { pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[]; calendars: { id: string; name: string; minutes: number | null }[] } | null;

const blank: RouteForm = { key: "", label: "", tags: [], pipelineId: null, stageId: null, calendarId: null };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function RouteMake({ lists }: { lists: Lists }) {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" className="wb-go fm-btn" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GPlus size={16} />Make a route</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="rt-make-h"><RouteDialog key={n} id="rt-make-h" start={blank} lists={lists} close={() => d.current?.close()} /></dialog>
    </>
  );
}

export function RouteEdit({ route, lists }: { route: RouteForm; lists: Lists }) {
  const d = useRef<HTMLDialogElement>(null);
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" className="rt-change" onClick={() => { setN((x) => x + 1); requestAnimationFrame(() => d.current?.showModal()); }}><GSliders size={14} />Change</button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby={`rt-h-${route.id}`}><RouteDialog key={n} id={`rt-h-${route.id}`} start={route} lists={lists} close={() => d.current?.close()} /></dialog>
    </>
  );
}

function RouteDialog({ id, start, lists, close }: { id: string; start: RouteForm; lists: Lists; close: () => void }) {
  const router = useRouter();
  const making = start.id === undefined;
  const [label, setLabel] = useState(start.label);
  const [key, setKey] = useState(start.key);
  const [keyTouched, setKeyTouched] = useState(!making);
  const [tags, setTags] = useState(start.tags.join(", "));
  const [stage, setStage] = useState(start.stageId ? `${start.pipelineId}|${start.stageId}` : "");
  const [cal, setCal] = useState(start.calendarId ?? "");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  const k = keyTouched ? key : slug(label);
  // A stage or calendar GHL no longer lists is kept as it is, and shown as such.
  const lostStage = start.stageId && !lists?.pipelines.some((p) => p.id === start.pipelineId && p.stages.some((s) => s.id === start.stageId));
  const lostCal = start.calendarId && !lists?.calendars.some((c) => c.id === start.calendarId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblems({});
    const [pipelineId, stageId] = stage ? stage.split("|") : [null, null];
    const body = { ...(making ? { key: k } : { id: start.id }), label, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), pipelineId, stageId, calendarId: cal || null };
    const r = await fetch("/api/console/routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { close(); router.refresh(); return; }
    const p: Record<string, string> = {};
    for (const line of r?.problems ?? ["form: Fernway could not be reached"]) {
      const [f, ...rest] = line.split(": ");
      const field = f!.startsWith("tags") ? "tags" : f === "pipelineId" ? "stageId" : f!;
      p[field] ??= rest.join(": ").replace(/^./, (c) => c.toUpperCase());
    }
    setProblems(p);
  }

  return (
    <form onSubmit={save} noValidate>
      <h2 id={id}>{making ? "Make a route" : `Change ${start.label}`}</h2>
      <p>{making ? "Name it after the form or page that sends it. Its key goes in that form's code and stays as made." : <>Leads already delivered stay as they are. The next lead on <code className="rt-inline">{start.key}</code> goes the new way.</>}</p>
      <div className="fm rt-fields">
        <Field kind="route" label="Name" bad={!!problems.label} error={problems.label} hint={`${label.length} of 80`}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Booking requests" autoFocus />
        </Field>
        <Field kind="key" label="Key" bad={!!problems.key} error={problems.key} hint={making ? "Letters, numbers and dashes" : "Fixed once made"}>
          <input value={k} onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase()); }} maxLength={40} disabled={!making}
            placeholder="booking" spellCheck={false} autoCapitalize="none" className="rt-mono" />
        </Field>
        <Field kind="tags" label="Tags on the contact" bad={!!problems.tags} error={problems.tags} hint="Separated by commas, 10 at most">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="booking, website" spellCheck={false} />
        </Field>
        <Field kind="stage" label="Pipeline stage" bad={!!problems.stageId} error={problems.stageId} hint={lists ? "Where the lead lands as an opportunity" : "GHL's lists can't be read now"}>
          <span className="ac-select">
            <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={!lists && !start.stageId}>
              <option value="">No stage: contact only</option>
              {lostStage && <option value={`${start.pipelineId}|${start.stageId}`}>{lists ? "No longer in GHL: " : ""}{start.stageId}</option>}
              {lists?.pipelines.map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {p.stages.map((s) => <option key={s.id} value={`${p.id}|${s.id}`}>{p.name} › {s.name}</option>)}
                </optgroup>
              ))}
            </select>
          </span>
        </Field>
        <Field kind="calendar" label="Calendar" bad={!!problems.calendarId} error={problems.calendarId} hint="Books the time a visitor picked">
          <span className="ac-select">
            <select value={cal} onChange={(e) => setCal(e.target.value)} disabled={!lists && !start.calendarId}>
              <option value="">No calendar</option>
              {lostCal && <option value={start.calendarId!}>{lists ? "No longer in GHL: " : ""}{start.calendarId}</option>}
              {lists?.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}{c.minutes ? `, ${c.minutes} min` : ""}</option>)}
            </select>
          </span>
        </Field>
      </div>
      {problems.form && <p className="fm-error" role="alert">{problems.form}</p>}
      {said && <DemoSaid what={<>the route is saved, the next lead on it goes the new way, and the change is written to the audit log.</>} />}
      <div className="fm-dialog-do">
        <button type="submit" className="wb-go fm-btn" disabled={busy || !label.trim() || !k}>{busy ? <GClock size={16} /> : making ? <GPlus size={16} /> : <GSave size={16} />}{busy ? "Saving" : making ? "Make the route" : "Save the route"}</button>
        <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={close}><GClose size={16} />Not now</button>
      </div>
    </form>
  );
}
