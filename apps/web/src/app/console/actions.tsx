"use client";
// Resend, for one lead or for every lead held for the same reason: a dialog first (2.20), then the page reads itself
// again so the board and the log show the lead moving.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { GClock, GClose, GResend } from "@/ui/glyphs";

export function ResendButton({ id, reason, count, waybill, label = "Resend", big = false }: {
  id?: number; reason?: string; count?: number; waybill?: string; label?: string; big?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const many = reason !== undefined;
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  async function go() {
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblem(null);
    const r = await fetch("/api/console/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(many ? { reason } : { id }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; resent?: number; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { dialog.current?.close(); router.refresh(); return; }
    setProblem((r?.problems?.[0] ?? "form: Fernway could not be reached").replace(/^[a-z]+: /, "").replace(/^./, (c) => c.toUpperCase()));
  }
  return (
    <>
      <button type="button" className={big ? "wb-go fm-btn cn-resend-big" : "cn-resend"} onClick={() => dialog.current?.showModal()}><GResend size={big ? 16 : 14} />{label}</button>
      <dialog ref={dialog} className="fm-dialog" aria-label="Resend" onClose={() => { setProblem(null); setSaid(false); }}>
        <h2>{many ? `Resend ${count} held ${count === 1 ? "lead" : "leads"}?` : `Resend ${waybill}?`}</h2>
        <p>{many
          ? <>Every lead GHL refused with <b>{reason}</b> gets a fresh set of 8 tries, starting now. If what GHL named isn&apos;t fixed yet, they are held again.</>
          : <>It gets a fresh set of 8 tries, starting now, and its receipt shows the resend. If what held it isn&apos;t fixed yet, it is held again.</>}</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>{many ? "these leads go" : "it goes"} back on the queue for a fresh set of 8 tries, and the resend is written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-go fm-btn" disabled={busy} onClick={go}>{busy ? <GClock size={16} /> : <GResend size={16} />}{busy ? "Resending" : many ? `Resend ${count}` : "Resend"}</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => dialog.current?.close()}><GClose size={16} />Not now</button>
        </div>
      </dialog>
    </>
  );
}
