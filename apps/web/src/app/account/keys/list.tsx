"use client";
// The keys as a table: each with its prefix (the rest is never shown again), who made it, when it was last used. A new
// key opens in a dialog that shows it once; revoking asks first (2.20), and the row is stamped Revoked at once.
import Link from "next/link";
import { useRef, useState } from "react";
import { Ago } from "@/ui/ago";
import { Field } from "@/ui/field";
import { GBrackets, GCheck, GClock, GClose, GCopy, GHold, GKey } from "@/ui/glyphs";

type Key = { prefix: string; label: string; madeBy: string | null; made: string; lastUsedAt: string | null; revoked: string | null };
const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false, problems: ["form: Fernway could not be reached"] })) as Promise<{ ok?: boolean; key?: string; prefix?: string; problems?: string[] }>;

export function KeyList({ keys: first, max }: { keys: Key[]; max: number }) {
  const [keys, setKeys] = useState(first);
  const make = useRef<HTMLDialogElement>(null);
  const ask = useRef<HTMLDialogElement>(null);
  const [revoking, setRevoking] = useState<Key | null>(null);
  const live = keys.filter((k) => !k.revoked).length;

  return (
    <>
      <div className="dv-bar">
        <p className="dv-count"><b>{live}</b>{live === 1 ? "live key" : "live keys"}<em>of {max}</em></p>
        <button type="button" className="wb-go fm-btn" disabled={live >= max} onClick={() => make.current?.showModal()}><GKey size={16} />Make a key</button>
        <Link className="ky-docs" href="/docs"><GBrackets size={15} />How to send leads with a key</Link>
      </div>
      {keys.length === 0 ? (
        <p className="bl-empty"><GKey size={16} />No keys yet. A key lets your own code send leads to Fernway&apos;s API.</p>
      ) : (
        <table className="bl-table ky-table">
          <thead><tr><th className="bl-num">#</th><th>Key</th><th>Name</th><th>Made</th><th>Last used</th><th>State</th><th><span className="bl-sr">Revoke</span></th></tr></thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={k.prefix} className={k.revoked ? "ky-off" : undefined}>
                <td className="bl-num">{keys.length - i}</td>
                <td className="ky-key"><code>fw_{k.prefix}_</code><i aria-label="hidden">••••••••</i></td>
                <td className="ky-label">{k.label}</td>
                <td>{k.made}{k.madeBy && <em>by {k.madeBy}</em>}</td>
                <td>{k.lastUsedAt ? <Ago iso={k.lastUsedAt} /> : <span className="ky-never">Never</span>}</td>
                <td>{k.revoked
                  ? <span className="bl-chip bl-chip-stop"><GHold size={13} />Revoked {k.revoked}</span>
                  : <span className="bl-chip bl-chip-ok"><GCheck size={13} />Live</span>}</td>
                <td className="bl-links">{!k.revoked && (
                  <button type="button" className="ky-revoke" onClick={() => { setRevoking(k); requestAnimationFrame(() => ask.current?.showModal()); }}><GClose size={14} />Revoke</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <MakeDialog ref={make} made={(k) => setKeys((ks) => [k, ...ks])} />
      <dialog ref={ask} className="fm-dialog" aria-labelledby="ky-ask-h">
        {revoking && <RevokeAsk k={revoking} close={() => ask.current?.close()} done={() => {
          setKeys((ks) => ks.map((x) => x.prefix === revoking.prefix ? { ...x, revoked: "just now" } : x));
          ask.current?.close();
        }} />}
      </dialog>
    </>
  );
}

function RevokeAsk({ k, close, done }: { k: Key; close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <h2 id="ky-ask-h">Revoke {k.label}?</h2>
      <p>Key <b className="ky-inline">fw_{k.prefix}_</b> stops at once: anything still sending with it gets 401 from then on. Leads it already sent stay as they are. This can&apos;t be undone; a new key can be made any time.</p>
      {problem && <p className="fm-error" role="alert">{problem}</p>}
      <div className="fm-dialog-do">
        <button type="button" className="wb-ghost fm-btn ac-stop sc-stop-go" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await post("/api/account/keys/revoke", { prefix: k.prefix });
          setBusy(false);
          if (r.ok) done(); else setProblem((r.problems?.[0] ?? "Not revoked").replace(/^[a-z]+: /, ""));
        }}>{busy ? <GClock size={16} /> : <GClose size={16} />}{busy ? "Revoking" : "Revoke the key"}</button>
        <button type="button" className="wb-ghost fm-btn" onClick={close}><GKey size={16} />Keep it</button>
      </div>
    </>
  );
}

function MakeDialog({ ref, made }: { ref: React.RefObject<HTMLDialogElement | null>; made: (k: Key) => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setProblem(null);
    const r = await post("/api/account/keys", { label });
    setBusy(false);
    if (r.ok && r.key && r.prefix) {
      setKey(r.key);
      made({ prefix: r.prefix, label: label.trim(), madeBy: "you", made: "Today", lastUsedAt: null, revoked: null });
    } else setProblem((r.problems?.[0] ?? "Not made").replace(/^[a-z]+: /, "").replace(/^./, (c) => c.toUpperCase()));
  }
  return (
    <dialog ref={ref} className="fm-dialog ky-dialog" aria-labelledby="ky-make-h" onClose={() => { setLabel(""); setKey(null); setCopied(false); setProblem(null); }}>
      {!key ? (
        <form onSubmit={go} noValidate>
          <h2 id="ky-make-h">Make an API key</h2>
          <p>Name it after what will use it, so the list says which key to revoke if that site or app goes.</p>
          <div className="fm sc-ask">
            <Field kind="name" label="Name" bad={!!problem} error={problem ?? undefined} hint={`${label.length} of 80`}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Northpine website" autoFocus />
            </Field>
          </div>
          <div className="fm-dialog-do">
            <button type="submit" className="wb-go fm-btn" disabled={!label.trim() || busy}>{busy ? <GClock size={16} /> : <GKey size={16} />}{busy ? "Making it" : "Make the key"}</button>
            <button type="button" className="wb-ghost fm-btn" onClick={() => ref.current?.close()}><GClose size={16} />Not now</button>
          </div>
        </form>
      ) : (
        <>
          <h2 id="ky-make-h">{label.trim()}</h2>
          <p>Copy it now: this is the only time it is shown. Fernway keeps only a fingerprint of it, so even Fernway can&apos;t show it again.</p>
          <div className="ky-shown">
            <code>{key}</code>
            <button type="button" className="sc-copy" onClick={async () => { await navigator.clipboard.writeText(key); setCopied(true); }}>{copied ? <GCheck size={14} /> : <GCopy size={14} />}{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="fm-dialog-do">
            <button type="button" className="wb-go fm-btn" disabled={!copied} onClick={() => ref.current?.close()}><GCheck size={16} />{copied ? "Done" : "Copy it first"}</button>
          </div>
        </>
      )}
    </dialog>
  );
}
