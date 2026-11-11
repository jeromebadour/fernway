"use client";
// Disconnect asks first (2.20): leads then hold until GHL is connected again.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { GClock, GNodes, GSilent } from "@/ui/glyphs";

export function Disconnect({ location }: { location: string }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const demo = useDemo();
  const [said, setSaid] = useState(false);
  async function go() {
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblem(null);
    const r = await fetch("/api/console/ghl/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setProblem((r?.problems?.[0] ?? "form: Fernway could not be reached").replace(/^[a-z]+: /, "").replace(/^./, (c) => c.toUpperCase()));
  }
  return (
    <>
      <button type="button" className="wb-ghost fm-btn ac-stop" onClick={() => d.current?.showModal()}><GSilent size={16} />Disconnect</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby="gh-off-h" onClose={() => { setProblem(null); setSaid(false); }}>
        <h2 id="gh-off-h">Disconnect GHL?</h2>
        <p>Fernway forgets its keys to sub-account <b>{location}</b> at once. Leads that arrive meanwhile are held, not lost; after you connect again, resend them from the board. To remove the app inside GHL too, uninstall it there.</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>Fernway forgets its GHL keys at once and the audit log says who did it.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={go}>{busy ? <GClock size={16} /> : <GSilent size={16} />}{busy ? "Disconnecting" : "Disconnect"}</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GNodes size={16} />Keep it</button>
        </div>
      </dialog>
    </>
  );
}
