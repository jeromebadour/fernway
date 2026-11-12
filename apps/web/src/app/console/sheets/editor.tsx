"use client";
// Linking the account's Google Sheet, changing it, and unlinking it, each in a dialog. Linking starts with Fernway's
// own address to share the sheet with (copied in one press), then the sheet's link; Fernway checks it can write there.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GCheck, GClock, GClose, GCopy, GSheet, GSliders, GTrash } from "@/ui/glyphs";

export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="sh-email">
      <code>{email}</code>
      <button type="button" className="wb-ghost fm-btn" onClick={async () => { await navigator.clipboard.writeText(email).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
        {copied ? <GCheck size={15} /> : <GCopy size={15} />}{copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

export function SheetLink({ email, change }: { email: string; change?: boolean }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblem(null);
    const r = await fetch("/api/console/sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheet: link }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setProblem((r?.problems?.[0] ?? "Fernway could not be reached. Try again.").replace(/^sheet: /, "").replace(/^./, (c) => c.toUpperCase()));
  }
  return (
    <>
      <button type="button" className={change ? "rt-change" : "wb-go fm-btn"} onClick={() => { setLink(""); setProblem(null); setSaid(false); d.current?.showModal(); }}>
        {change ? <GSliders size={14} /> : <GSheet size={16} />}{change ? "Change" : "Link a sheet"}
      </button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="sh-link-h">
        <form onSubmit={save} noValidate>
          <h2 id="sh-link-h">{change ? "Link another sheet" : "Link a Google Sheet"}</h2>
          <ol className="sh-steps">
            <li><span>In the sheet, press <b>Share</b> and add Fernway&apos;s address as an <b>Editor</b>.</span><CopyEmail email={email} /></li>
            <li><span>Paste the sheet&apos;s link here.</span></li>
          </ol>
          <div className="fm rt-fields sh-field">
            <Field kind="sheet" label="The sheet's link" bad={!!problem} error={problem} hint="Fernway adds a tab, Fernway leads, and writes only there">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" spellCheck={false} autoCapitalize="none" autoFocus />
            </Field>
          </div>
          {change && <p className="sh-note">Leads picked up from now on go to the new sheet. The old sheet keeps its rows.</p>}
          {said && <DemoSaid what={<>Fernway would check it can write to the sheet, add the Fernway leads tab, and write the change to the audit log.</>} />}
          <div className="fm-dialog-do">
            <button type="submit" className="wb-go fm-btn" disabled={busy || !link.trim()}>{busy ? <GClock size={16} /> : <GSheet size={16} />}{busy ? "Checking the sheet" : "Link the sheet"}</button>
            <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />Not now</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function SheetUnlink({ title }: { title: string }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="ky-revoke" onClick={() => { setSaid(false); setProblem(null); d.current?.showModal(); }}><GTrash size={14} />Unlink</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby="sh-unlink-h">
        <h2 id="sh-unlink-h">Unlink {title}?</h2>
        <p>Fernway stops writing to it. The rows already there stay, and the sheet stays shared until you remove Fernway&apos;s address in Google.</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>Fernway would stop writing to the sheet, and the change would be written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
            if (demo) { setSaid(true); return; }
            setBusy(true);
            const r = await fetch("/api/console/sheet", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
            setBusy(false);
            if (r?.ok) { d.current?.close(); router.refresh(); } else setProblem("Fernway could not unlink it just now. Try again.");
          }}>{busy ? <GClock size={16} /> : <GTrash size={16} />}Unlink the sheet</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GSheet size={16} />Keep it</button>
        </div>
      </dialog>
    </>
  );
}

/** Reading the tab "Leads in": pick the route its rows take (routes without a meeting time), or turn it off. */
export function SheetIn({ current, routes }: { current: string | null; routes: { key: string; label: string }[] }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [pick, setPick] = useState<string | null>(current ?? routes[0]?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  async function send(route: string | null) {
    if (demo) { setSaid(route ? "Fernway would add the tab Leads in, read it every minute, and write the change to the audit log." : "Fernway would stop reading Leads in, and write the change to the audit log."); return; }
    setBusy(true); setProblem(null);
    const r = await fetch("/api/console/sheet/in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setProblem((r?.problems?.[0] ?? "Fernway could not be reached. Try again.").replace(/^\w+: /, "").replace(/^./, (c) => c.toUpperCase()));
  }
  return (
    <>
      <button type="button" className={current ? "rt-change" : "wb-go fm-btn"} onClick={() => { setPick(current ?? routes[0]?.key ?? null); setSaid(null); setProblem(null); d.current?.showModal(); }}>
        {current ? <GSliders size={14} /> : <GSheet size={16} />}{current ? "Change" : "Turn on"}
      </button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="sh-in-h">
        <h2 id="sh-in-h">{current ? "Change Leads in" : "Read leads from the sheet"}</h2>
        <p>Fernway adds the tab <b>Leads in</b> to your sheet and reads it every minute. Each new row with an email or a phone becomes a lead on the route below, once; Fernway writes its waybill and state back into the row.</p>
        <fieldset className="ef-pick">
          <legend className="fm-label">Its rows take the route</legend>
          {routes.length === 0 ? <p className="fm-error">No route without a meeting time yet. Make one under Routes first.</p> : routes.map((r) => (
            <label key={r.key} className={`ef-chip${pick === r.key ? " ef-on" : ""}`}>
              <input type="radio" name="sh-in-route" value={r.key} checked={pick === r.key} onChange={() => setPick(r.key)} />
              <code>{r.key}</code>{r.label}
            </label>
          ))}
        </fieldset>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>{said}</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-go fm-btn" disabled={busy || !pick || pick === current} onClick={() => send(pick)}>{busy ? <GClock size={16} /> : <GSheet size={16} />}{current ? "Save the route" : "Turn on"}</button>
          {current && <button type="button" className="wb-ghost fm-btn ac-stop" disabled={busy} onClick={() => send(null)}><GClose size={16} />Turn off</button>}
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />Not now</button>
        </div>
      </dialog>
    </>
  );
}
