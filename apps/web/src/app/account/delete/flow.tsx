"use client";
// What goes, as three scans in the order they happen; then a dialog where the account's name is typed (2.20). On
// pressing, the scans tick off one by one from Fernway's real answer, then the sign-in page says it is done (2.21).
import { useRef, useState } from "react";
import { Field } from "@/ui/field";
import { GCheck, GClock, GClose, GHold, GTrash } from "@/ui/glyphs";

type Step = { what: string; now: string };
type Done = { what: "ghl" | "stripe" | "fernway"; done: boolean; detail: string };
const names: Record<Done["what"], string> = { ghl: "GHL", stripe: "Stripe", fernway: "Fernway" };

export function DeleteFlow({ steps, name }: { steps: Step[]; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Done[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const match = typed.trim() === name;

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setProblem(null); setShown([]);
    const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: typed }) })
      .then((x) => x.json()).catch(() => ({ ok: false, steps: [], problems: ["form: Fernway could not be reached; nothing was deleted"] })) as
      { ok?: boolean; steps?: Done[]; next?: string; problems?: string[] };
    // Each step's scan lands in turn, so the order is seen.
    for (const s of r.steps ?? []) { await new Promise((ok) => setTimeout(ok, 450)); setShown((x) => [...x, s]); }
    if (r.ok && r.next) { await new Promise((ok) => setTimeout(ok, 900)); window.location.assign(r.next); return; }
    setProblem((r.problems?.[0] ?? "Not deleted").replace(/^[a-z]+: /, "").replace(/^./, (c) => c.toUpperCase()));
    setBusy(false);
  }

  return (
    <>
      <ol className="dl-scans">
        {steps.map((s, i) => (
          <li key={s.what}><span className="dl-n">{i + 1}</span><div><p className="dl-what">{s.what}</p><p className="dl-now">{s.now}</p></div></li>
        ))}
      </ol>
      <p className="dl-note">Each place is done before the next starts. If GHL or Stripe can&apos;t be reached, it stops there and nothing in Fernway is removed; pressing again carries on.</p>
      <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go dl-open" onClick={() => dialog.current?.showModal()}><GTrash size={16} />Delete account</button>

      <dialog ref={dialog} className="fm-dialog dl-dialog" aria-labelledby="dl-h" onClose={() => { if (!busy) { setTyped(""); setShown([]); setProblem(null); } }}>
        <form onSubmit={go} noValidate>
          <h2 id="dl-h">Delete {name}?</h2>
          <p>This can&apos;t be undone. Fernway keeps nothing afterwards, so there is nothing to restore from.</p>
          <div className="fm sc-ask">
            <Field kind="company" label={`Type ${name} to confirm`} bad={!!problem && !shown.length} hint={match ? <span className="dl-match"><GCheck size={13} />Matches</span> : "Exactly as written, capitals too."}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus disabled={busy} />
            </Field>
          </div>
          {shown.length > 0 && (
            <ol className="dl-live" aria-live="polite">
              {shown.map((s) => (
                <li key={s.what} className={s.done ? "dl-ok" : "dl-bad"}>{s.done ? <GCheck size={14} /> : <GHold size={14} />}<b>{names[s.what]}</b>{s.detail}</li>
              ))}
            </ol>
          )}
          {problem && <p className="fm-error" role="alert">{problem}</p>}
          <div className="fm-dialog-do">
            <button type="submit" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={!match || busy}>{busy ? <GClock size={16} /> : <GTrash size={16} />}{busy ? "Deleting" : "Delete everything"}</button>
            <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => dialog.current?.close()}><GClose size={16} />Keep the account</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
