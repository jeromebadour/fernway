"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardView, LeadView, LogRow, LogState } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GFind, GHold, GJump, GManifest, GMark, GOut, GResend, GRoute, GStage, GCalendar, GTrash, GScan, GHand } from "@/ui/glyphs";
import { stateWord } from "@/app/console/states";

// Fernway inside GHL. GHL frames this page and, asked, hands it the signed-in GHL user sealed with the app's shared
// secret; Fernway swaps that for a 2-hour ticket to the sub-account's own leads. Nothing is kept in the browser.

type Log = { total: number; page: number; pages: number; counts: Record<LogState, number>; rows: LogRow[] };
type Session = { ticket: string; account: string; user: string };
type Phase = { at: "asking" } | { at: "outside" } | { at: "closed"; why: string } | { at: "in"; s: Session };

const tabs: { k: LogState | ""; w: string }[] = [
  { k: "", w: "All" }, { k: "held", w: "Held" }, { k: "returned", w: "Returned" }, { k: "waiting", w: "Waiting" },
  { k: "moving", w: "In transit" }, { k: "signed", w: "Signed for" },
];
const scanWord: Record<string, { w: string; G: typeof GScan; tone: string }> = {
  picked_up: { w: "Picked up", G: GScan, tone: "in" }, checked: { w: "Checked", G: GCheck, tone: "ok" },
  handed: { w: "Handed to GHL", G: GHand, tone: "in" }, signed: { w: "Signed for", G: GManifest, tone: "ok" },
  retry_scheduled: { w: "GHL said not now · re-send booked", G: GResend, tone: "re" }, resent: { w: "Resent", G: GResend, tone: "re" },
  held: { w: "Held", G: GHold, tone: "hz" }, returned: { w: "Returned", G: GHold, tone: "hz" },
  ghl_moved: { w: "Moved in GHL", G: GStage, tone: "in" }, ghl_changed: { w: "Changed in GHL", G: GCalendar, tone: "in" },
  ghl_deleted: { w: "Deleted in GHL", G: GTrash, tone: "hz" },
};
const stepWord: Record<string, string> = { contact: "Contact", note: "Note", appointment: "Meeting", opportunity: "Pipeline" };
const closedWord: Record<string, { h: string; p: string }> = {
  "not-connected": { h: "This sub-account is not connected to Fernway", p: "Connect it from your Fernway console (GHL page), then open this page again." },
  agency: { h: "Open Fernway from a sub-account", p: "Fernway carries leads into one sub-account at a time. Switch to the sub-account, then open Fernway from its menu." },
  payload: { h: "GHL's note about you could not be read", p: "Reload the page. If it keeps happening, the app's shared secret may have changed; tell support@jeromebadour.com." },
  "not-set-up": { h: "Fernway inside GHL is not switched on yet", p: "Use the Fernway console at fernway.jeromebadour.com meanwhile." },
  busy: { h: "Too many openings at once", p: "Wait a minute, then reload." },
};

const fallback = { h: "GHL's note about you could not be read", p: "Reload the page. If it keeps happening, tell support@jeromebadour.com." };

export function GhlApp() {
  const [phase, setPhase] = useState<Phase>({ at: "asking" });

  // Ask GHL who is looking; GHL answers with a sealed note that only Fernway's server can open. Outside a frame, or
  // with no answer in 8 seconds, the page explains where it lives instead.
  const listen = useCallback(() => {
    let done = false;
    const finish = () => { done = true; window.removeEventListener("message", heard); clearTimeout(t); };
    const heard = async (e: MessageEvent) => {
      if (done || e.source !== window.parent || e.data?.message !== "REQUEST_USER_DATA_RESPONSE") return;
      finish();
      const r = await fetch("/api/ghl/app/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload: e.data.payload }) });
      const b = await r.json().catch(() => ({})) as { ok?: boolean; why?: string; ticket?: string; account?: { name: string }; user?: string };
      setPhase(b.ok && b.ticket ? { at: "in", s: { ticket: b.ticket, account: b.account?.name ?? "", user: b.user ?? "" } } : { at: "closed", why: b.why ?? "payload" });
    };
    const t = setTimeout(() => { if (!done) { finish(); setPhase({ at: "outside" }); } }, window.parent === window ? 0 : 8000);
    if (window.parent !== window) {
      window.addEventListener("message", heard);
      window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
    }
    return finish;
  }, []);
  useEffect(() => listen(), [listen]);
  // A ticket that ran out (after 2 hours) is swapped for a new one the same way.
  const again = useCallback(() => { setPhase({ at: "asking" }); listen(); }, [listen]);
  const closed = phase.at === "closed" ? (closedWord[phase.why] ?? fallback) : fallback;

  if (phase.at === "in") return <Inside s={phase.s} again={again} />;
  return (
    <main className="ga ga-center">
      <div className="ga-card ga-gate">
        <p className="ga-brand"><GMark size={22} />Fernway</p>
        {phase.at === "asking" && <><h1>Asking GHL who you are</h1><p>One moment.</p></>}
        {phase.at === "outside" && <><h1>This page lives inside GoHighLevel</h1><p>Open Fernway from the left menu of a connected sub-account. Outside GHL, use the console instead.</p>
          <a className="ga-btn" href="/console" target="_top"><GJump size={15} />Open the Fernway console</a></>}
        {phase.at === "closed" && <><h1>{closed.h}</h1><p>{closed.p}</p></>}
      </div>
    </main>
  );
}

function Inside({ s, again }: { s: Session; again: () => void }) {
  const [board, setBoard] = useState<BoardView | null>(null);
  const [log, setLog] = useState<Log | null>(null);
  const [state, setState] = useState<LogState | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const typed = useRef("");

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${s.ticket}`, "Content-Type": "application/json" } });
    if (r.status === 401) { again(); return null; }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [s.ticket, again]);

  useEffect(() => {
    const u = new URLSearchParams({ page: String(page) });
    if (state) u.set("state", state);
    if (q) u.set("q", q);
    let live = true;
    call(`/api/ghl/app/view?${u}`).then((r) => { if (live && r?.status === 200) { setBoard(r.body.board); setLog(r.body.log); } });
    return () => { live = false; };
  }, [call, state, q, page, tick]);

  const resend = async (what: { id: number } | { reason: string }) => {
    const r = await call("/api/ghl/app/resend", { method: "POST", body: JSON.stringify(what) });
    if (!r) return;
    setSaid(r.body.ok ? `${r.body.resent === 1 ? "1 lead" : `${r.body.resent} leads`} sent again. Watch for the signature.` : String(r.body.problems?.[0] ?? "Could not resend").replace(/^form: /, ""));
    setTick((t) => t + 1);
  };

  if (open !== null) return <LeadPane id={open} call={call} close={() => { setOpen(null); setTick((t) => t + 1); }} resend={resend} said={said} />;
  const tiles: { k: LogState; n: number | undefined; w: string; tone: string; G: typeof GRoute }[] = [
    { k: "moving", n: board?.moving, w: "In transit", tone: "in", G: GRoute },
    { k: "waiting", n: board?.waiting, w: "Waiting to retry", tone: "re", G: GResend },
    { k: "held", n: board?.held, w: "Held", tone: "hz", G: GHold },
    { k: "returned", n: board?.returned, w: "Returned", tone: "hz", G: GHold },
    { k: "signed", n: board?.signed24h, w: "Signed for · 24 h", tone: "ok", G: GCheck },
  ];

  return (
    <main className="ga">
      <header className="ga-top">
        <p className="ga-brand"><GMark size={22} />Fernway<span>deliveries into {s.account}</span></p>
        <p className="ga-me">{s.user}</p>
      </header>
      {said && <p className="ga-said" role="status"><GResend size={15} />{said}<button type="button" onClick={() => setSaid(null)} aria-label="Dismiss">×</button></p>}

      <section className="ga-tiles" aria-label="Board">
        {tiles.map((t) => (
          <button key={t.k} type="button" className={`ga-card ga-tile ga-${t.tone}${state === t.k ? " ga-on" : ""}`} onClick={() => { setState(state === t.k ? "" : t.k); setPage(1); }}>
            <span className="ga-tile-w"><t.G size={15} />{t.w}</span>
            <b>{t.n ?? "·"}</b>
          </button>
        ))}
      </section>

      {board && board.holdReasons.length > 0 && (
        <section className="ga-card ga-reasons">
          <h2><GHold size={16} />Why leads are held</h2>
          <ul>
            {board.holdReasons.slice(0, 4).map((h) => (
              <li key={h.reason}>
                <span className="ga-reason">{h.reason}</span>
                <span className="ga-muted">{h.count} · latest <Ago iso={h.latest} /></span>
                <button type="button" className="ga-btn ga-btn-s" onClick={() => resend({ reason: h.reason })}><GResend size={14} />Resend {h.count === 1 ? "it" : `all ${h.count}`}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ga-card ga-log">
        <div className="ga-log-head">
          <nav className="ga-tabs" aria-label="Show">
            {tabs.map((t) => (
              <button key={t.k} type="button" className={state === t.k ? "ga-on" : ""} onClick={() => { setState(t.k); setPage(1); }}>
                {t.w}{t.k && log ? <span>{log.counts[t.k]}</span> : null}
              </button>
            ))}
          </nav>
          <form className="ga-find" role="search" onSubmit={(e) => { e.preventDefault(); setQ(typed.current.trim()); setPage(1); }}>
            <GFind size={15} />
            <input type="search" placeholder="Waybill, name, email, phone" aria-label="Find a lead" onChange={(e) => { typed.current = e.target.value; if (!e.target.value) { setQ(""); setPage(1); } }} />
          </form>
        </div>
        <table>
          <thead><tr><th>Waybill</th><th>Lead</th><th>Route</th><th>State</th><th>Picked up</th><th aria-label="Do" /></tr></thead>
          <tbody>
            {log?.rows.map((r) => {
              const w = stateWord(r.state, r.tries);
              return (
                <tr key={r.shipmentId}>
                  <td><button type="button" className="ga-wb" onClick={() => setOpen(r.shipmentId)}><GManifest size={14} />{r.waybill}</button></td>
                  <td><span className="ga-who">{r.who}</span><span className="ga-muted">{r.email ?? r.company ?? ""}</span></td>
                  <td>{r.route}</td>
                  <td><span className={`ga-pill ga-${w.tone}`}><w.G size={13} />{w.word}</span>{r.reason && <span className="ga-muted ga-why">{r.reason}</span>}</td>
                  <td className="ga-muted"><Ago iso={r.at} /></td>
                  <td className="ga-do">{(r.state === "held" || r.state === "returned") && <button type="button" className="ga-btn ga-btn-s" onClick={() => resend({ id: r.shipmentId })}><GResend size={14} />Resend</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {log && log.rows.length === 0 && <p className="ga-empty">{q ? `No lead matches "${q}".` : "No leads here yet."}</p>}
        {log && log.pages > 1 && (
          <p className="ga-pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Newer</button>
            <span>Page {log.page} of {log.pages} · {log.total.toLocaleString("en-GB")} leads</span>
            <button type="button" disabled={page >= log.pages} onClick={() => setPage(page + 1)}>Older ›</button>
          </p>
        )}
      </section>
      <p className="ga-foot"><a href="/console" target="_blank" rel="noopener"><GOut size={14} />Routes, team and every setting live in the Fernway console</a></p>
    </main>
  );
}

type Call = (path: string, init?: RequestInit) => Promise<{ status: number; body: { ok?: boolean; lead?: LeadView; receipt?: string } } | null>;

function LeadPane({ id, call, close, resend, said }: { id: number; call: Call; close: () => void; resend: (w: { id: number }) => Promise<void>; said: string | null }) {
  const [v, setV] = useState<{ lead: LeadView; receipt: string } | null | "gone">(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    call(`/api/ghl/app/lead?id=${id}`).then((r) => { if (live && r) setV(r.status === 200 && r.body.lead ? { lead: r.body.lead, receipt: r.body.receipt ?? "" } : "gone"); });
    return () => { live = false; };
  }, [call, id, tick]);
  const back = <button type="button" className="ga-back" onClick={close}><GJump size={14} />All deliveries</button>;
  if (v === null) return <main className="ga">{back}</main>;
  if (v === "gone") return <main className="ga">{back}<p className="ga-card ga-empty">That lead is not in this sub-account.</p></main>;
  const l = v.lead, c = l.contact, w = stateWord(l.state, l.tries);
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "No name";
  return (
    <main className="ga">
      {back}
      {said && <p className="ga-said" role="status"><GResend size={15} />{said}</p>}
      <header className="ga-card ga-lead-head">
        <div>
          <p className="ga-eyebrow"><GManifest size={15} />Waybill</p>
          <h1>{l.waybill}</h1>
          <p className="ga-muted">{name}{c.email ? ` · ${c.email}` : ""} · to <b>{l.route.label}</b> · picked up <Ago iso={l.createdAt} /></p>
        </div>
        <div className="ga-lead-do">
          <span className={`ga-pill ga-pill-l ga-${w.tone}`}><w.G size={15} />{w.word}</span>
          {(l.state === "held" || l.state === "returned") && <button type="button" className="ga-btn" onClick={async () => { await resend({ id: l.shipmentId }); setTick((t) => t + 1); }}><GResend size={15} />Resend</button>}
          {v.receipt && <a className="ga-btn ga-btn-ghost" href={v.receipt} target="_blank" rel="noopener"><GOut size={15} />Receipt</a>}
        </div>
      </header>
      {l.reason && <p className="ga-card ga-held"><GHold size={16} /><span><b>GHL said:</b> {l.reason}</span></p>}
      {l.state === "waiting" && l.nextTryAt && <p className="ga-card ga-held ga-wait"><GClock size={16} /><span>Try {l.tries + 1} of 8 is booked.</span></p>}
      <section className="ga-card ga-scans">
        <h2><GRoute size={16} />Every scan</h2>
        <ol>
          {l.scans.map((sc) => {
            const k = scanWord[sc.kind] ?? { w: sc.kind, G: GScan, tone: "in" };
            return (
              <li key={sc.id}>
                <span className={`ga-dot ga-${k.tone}`}><k.G size={13} /></span>
                <span><b>{k.w}{sc.step ? ` · ${stepWord[sc.step] ?? sc.step}` : ""}</b>
                  <span className="ga-muted">{[sc.try ? `try ${sc.try}` : null, sc.status !== null ? `GHL ${sc.status}` : null, sc.ms !== null ? `${sc.ms} ms` : null, sc.note].filter(Boolean).join(" · ")}</span></span>
                <span className="ga-muted ga-at"><Ago iso={sc.at} /></span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
