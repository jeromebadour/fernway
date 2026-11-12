"use client";
// Turning lead score on or off: a dialog first, saying what changes, then the change (owners and admins).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { GClock, GClose, GScore } from "@/ui/glyphs";

export function ScoreToggle({ on }: { on: boolean }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={on ? "wb-ghost fm-btn ac-stop" : "wb-go fm-btn"} onClick={() => { setSaid(false); setProblem(null); d.current?.showModal(); }}>
        <GScore size={16} />{on ? "Turn off" : "Turn on"}
      </button>
      <dialog ref={d} className="fm-dialog" aria-labelledby="ls-toggle-h">
        <h2 id="ls-toggle-h">{on ? "Turn lead score off?" : "Turn lead score on?"}</h2>
        {on
          ? <p>New leads are no longer read by Claude. Scores already made stay, in the console and on the GHL contacts.</p>
          : <p>Every lead picked up from now on is read by Claude: its score, a line and its reasons land here and on the GHL contact as a note and a tag. Claude is sent no name, email address or phone number.</p>}
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={on ? <>new leads would stop being scored, and the change would be written to the audit log.</> : <>new leads would be scored from now on, and the change written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className={on ? "wb-ghost fm-btn ac-stop sc-stop-go" : "wb-go fm-btn"} disabled={busy} onClick={async () => {
            if (demo) { setSaid(true); return; }
            setBusy(true);
            const r = await fetch("/api/console/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !on }) }).then((x) => x.json()).catch(() => null);
            setBusy(false);
            if (r?.ok) { d.current?.close(); router.refresh(); } else setProblem("Fernway could not change it just now. Try again.");
          }}>{busy ? <GClock size={16} /> : <GScore size={16} />}{on ? "Turn it off" : "Turn it on"}</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />Cancel</button>
        </div>
      </dialog>
    </>
  );
}
