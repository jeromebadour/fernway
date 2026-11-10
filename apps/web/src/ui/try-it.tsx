"use client";
// The quick start's own run button: the same request as the curl beside it, sent from this page with the public key,
// then the same lead again (one waybill), then tracked. Each answer is shown as the API gave it.
import Link from "next/link";
import { useState } from "react";
import { GCheck, GFind, GResend, GRoute } from "./glyphs";

type Shown = { label: string; status: number; body: unknown };
type Accepted = { ok: true; number: string; duplicate: boolean; links: { self: string; receipt: string } };

export function TryIt({ apiKey, body }: { apiKey: string; body: object }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const [lead, setLead] = useState<Accepted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(label: string, path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } });
      const json = await res.json();
      setShown((s) => [{ label, status: res.status, body: json }, ...s].slice(0, 3));
      return json;
    } catch {
      setError("The request didn't reach Fernway. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const send = async (again: boolean) => {
    const json = await call(again ? "The same lead again" : "Send the lead", "/api/v1/leads", { method: "POST", body: JSON.stringify(body) });
    if (json?.ok) setLead(json as Accepted);
  };

  const step = !lead ? 0 : shown.some((s) => s.label === "The same lead again") ? 2 : 1;
  return (
    <div className="dc-try" aria-labelledby="dc-try-h">
      <p className="wb-label" id="dc-try-h">Run it here</p>
      <p className="dc-try-lede">The same request, sent from this page with the demo key.</p>
      <div className="dc-try-do">
        {!lead && <button type="button" className="wb-go fm-btn" disabled={busy} onClick={() => send(false)}><GRoute size={16} />Send the lead</button>}
        {lead && <button type="button" className="wb-ghost" disabled={busy} onClick={() => send(true)}><GResend size={16} />Same key again</button>}
        {lead && <button type="button" className="wb-ghost" disabled={busy} onClick={() => call("Track it", lead.links.self)}><GFind size={16} />Track it</button>}
      </div>
      {step > 0 && (
        <p className="dc-try-note" role="status">
          <GCheck size={15} />
          <span>{step === 1 ? <>Waybill <b>{lead!.number}</b> picked up. Send the same key again: you get the same waybill, nothing twice.</>
            : <>Same key, same waybill <b>{lead!.number}</b>. Track it to see every scan, or <Link href={new URL(lead!.links.receipt).pathname}>open its receipt</Link>.</>}</span>
        </p>
      )}
      {error && <p className="dc-try-err" role="alert">{error}</p>}
      {shown.map((s, i) => (
        <figure key={`${s.label}-${shown.length - i}`} className="dc-answer">
          <figcaption><span>{s.label}</span><span className={s.status < 300 ? "dc-ok" : "dc-no"}>{s.status}</span></figcaption>
          <pre tabIndex={0}><code>{JSON.stringify(s.body, null, 2)}</code></pre>
        </figure>
      ))}
    </div>
  );
}
