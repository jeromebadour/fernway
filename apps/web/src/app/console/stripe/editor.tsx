"use client";
// Linking the account's own Stripe, changing it, and unlinking it, each in a dialog. Linking shows the steps in Stripe's
// own words (where to add the webhook, which events, where the signing secret is), then the secret and the route.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DemoSaid, useDemo } from "@/ui/demo-mode";
import { Field } from "@/ui/field";
import { GClock, GClose, GPayIn, GSliders, GTrash } from "@/ui/glyphs";
import { CopyEmail as CopyText } from "../sheets/editor";

type Route = { key: string; label: string };

export function StripeLink({ address, current, routes }: { address: string; current: string | null; routes: Route[] }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const change = current !== null;
  const [secret, setSecret] = useState("");
  const [pick, setPick] = useState<string | null>(current ?? routes[0]?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const said1 = (field: string) => problems.find((p) => p.startsWith(`${field}: `))?.replace(`${field}: `, "").replace(/^./, (c) => c.toUpperCase()) ?? null;
  const other = problems.find((p) => !/^(secret|route): /.test(p))?.replace(/^form: /, "") ?? null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) { setSaid(true); return; }
    setBusy(true); setProblems([]);
    const r = await fetch("/api/console/stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, route: pick }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setProblems(r?.problems ?? ["form: Fernway could not be reached. Try again."]);
  }
  return (
    <>
      <button type="button" className={change ? "rt-change" : "wb-go fm-btn"} onClick={() => { setSecret(""); setPick(current ?? routes[0]?.key ?? null); setProblems([]); setSaid(false); d.current?.showModal(); }}>
        {change ? <GSliders size={14} /> : <GPayIn size={16} />}{change ? "Change" : "Link Stripe"}
      </button>
      <dialog ref={d} className="fm-dialog rt-dialog" aria-labelledby="si-link-h">
        <form onSubmit={save} noValidate>
          <h2 id="si-link-h">{change ? "Change the Stripe link" : "Link your Stripe"}</h2>
          {!change && (
            <ol className="sh-steps">
              <li><span>In Stripe, open <b>Developers</b>, <b>Webhooks</b>, and add a destination for <b>Checkout</b> events: <code>checkout.session.completed</code> and <code>checkout.session.async_payment_succeeded</code>.</span></li>
              <li><span>Its endpoint URL is your Fernway address.</span><CopyText email={address} /></li>
              <li><span>Open the destination, reveal its <b>Signing secret</b>, and paste it below.</span></li>
            </ol>
          )}
          <div className="fm rt-fields sh-field">
            <Field kind="secret" label="Signing secret" bad={!!said1("secret")} error={said1("secret")} hint={change ? "Leave it empty to keep the one Fernway has" : "Kept sealed; Fernway never shows it again"}>
              <input value={secret} onChange={(e) => setSecret(e.target.value.trim())} placeholder="whsec_…" spellCheck={false} autoCapitalize="none" autoComplete="off" autoFocus />
            </Field>
          </div>
          <fieldset className="ef-pick">
            <legend className="fm-label">Paid checkouts take the route</legend>
            {routes.length === 0 ? <p className="fm-error">No route without a meeting time yet. Make one under Routes first.</p> : routes.map((r) => (
              <label key={r.key} className={`ef-chip${pick === r.key ? " ef-on" : ""}`}>
                <input type="radio" name="si-route" value={r.key} checked={pick === r.key} onChange={() => setPick(r.key)} />
                <code>{r.key}</code>{r.label}
              </label>
            ))}
          </fieldset>
          {said1("route") && <p className="fm-error" role="alert">{said1("route")}</p>}
          {other && <p className="fm-error" role="alert">{other}</p>}
          {said && <DemoSaid what={<>Fernway would keep the secret sealed, take every paid checkout from this Stripe to the route, and write the change to the audit log.</>} />}
          <div className="fm-dialog-do">
            <button type="submit" className="wb-go fm-btn" disabled={busy || !pick || (!change && !secret)}>{busy ? <GClock size={16} /> : <GPayIn size={16} />}{busy ? "Linking" : change ? "Save" : "Link Stripe"}</button>
            <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />Not now</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function StripeUnlink() {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const demo = useDemo();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="ky-revoke" onClick={() => { setSaid(false); setProblem(null); d.current?.showModal(); }}><GTrash size={14} />Unlink</button>
      <dialog ref={d} className="fm-dialog" aria-labelledby="si-unlink-h">
        <h2 id="si-unlink-h">Unlink Stripe?</h2>
        <p>Fernway refuses Stripe&apos;s calls to this address from now on, and forgets the signing secret. Leads already picked up stay. Remove the webhook in Stripe too, or Stripe keeps trying.</p>
        {problem && <p className="fm-error" role="alert">{problem}</p>}
        {said && <DemoSaid what={<>Fernway would stop taking payments from this Stripe, and the change would be written to the audit log.</>} />}
        <div className="fm-dialog-do">
          <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
            if (demo) { setSaid(true); return; }
            setBusy(true);
            const r = await fetch("/api/console/stripe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => null);
            setBusy(false);
            if (r?.ok) { d.current?.close(); router.refresh(); } else setProblem("Fernway could not unlink it just now. Try again.");
          }}>{busy ? <GClock size={16} /> : <GTrash size={16} />}Unlink Stripe</button>
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GPayIn size={16} />Keep it</button>
        </div>
      </dialog>
    </>
  );
}
