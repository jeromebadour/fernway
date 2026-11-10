"use client";
// Break it: pick what GHL does wrong, send an invented lead, and watch Fernway deal with it on the live receipt.
import { useRef, useState } from "react";
import type { TrackView } from "@fernway/delivery";
import { GClock, GCopy, GDown, GHold, GKey, GResend, GRoute, GScan, GSilent } from "@/ui/glyphs";
import { Receipt } from "@/ui/receipt";

type Failure = { key: string; label: string; ghl: string; fernway: string };
const glyph: Record<string, typeof GClock> = { busy: GClock, down: GDown, timeout: GSilent, token: GKey, refused: GHold, twice: GCopy };

type Run = { track: string; view: TrackView; number: string; twice?: boolean; round: number };

export function BreakIt({ failures }: { failures: readonly Failure[] }) {
  const [pick, setPick] = useState(failures[0]!.key);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const watch = useRef<HTMLDivElement>(null);

  async function view(track: string) {
    return (await fetch(`/api/track/${track}`, { cache: "no-store" }).then((r) => r.json())).view as TrackView;
  }

  async function send() {
    setBusy(true);
    setProblem(null);
    setRun(null);
    const key = crypto.randomUUID();
    const post = () => fetch("/api/breakit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ failure: pick, key }) }).then((r) => r.json());
    try {
      const first = await post();
      if (!first.ok) { setProblem(first.problem); return; }
      // "Sent twice": the same lead, the same key, sent again at once, as a site's retry or double press would.
      const second = pick === "twice" ? await post() : null;
      setRun({ track: first.track, view: await view(first.track), number: first.number, twice: second?.ok && second.number === first.number, round: 0 });
      requestAnimationFrame(() => {
        const el = watch.current;
        if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setProblem("Couldn't reach Fernway. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendIt() {
    if (!run) return;
    setResending(true);
    try {
      const r = await fetch("/api/breakit/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: run.track }) });
      if (r.ok) setRun({ ...run, view: await view(run.track), round: run.round + 1 });
    } finally {
      setResending(false);
    }
  }

  const chosen = failures.find((f) => f.key === pick)!;
  const held = run && run.round === 0 && pick === "refused";
  return (
    <div className="bk-grid">
      <div>
        <p className="wb-label">1 · What should GHL do?</p>
        <div className="bk-picks" role="radiogroup" aria-label="What GHL does">
          {failures.map((f) => {
            const G = glyph[f.key] ?? GScan;
            return (
              <button key={f.key} type="button" role="radio" aria-checked={f.key === pick} disabled={busy}
                className={f.key === pick ? "bk-pick bk-on" : "bk-pick"} onClick={() => { setPick(f.key); setRun(null); setProblem(null); }}>
                <span className="bk-pick-head"><G size={17} /><b>{f.label}</b></span>
                <span className="bk-ghl">{f.ghl}</span>
              </button>
            );
          })}
        </div>
        <div className="bk-plan">
          <p className="wb-label">2 · What Fernway will do</p>
          <p className="bk-plan-text"><GRoute size={16} />{chosen.fernway}</p>
        </div>
        <div className="bk-do">
          <button type="button" className="wb-go wb-go-lg fm-btn" onClick={send} disabled={busy}>
            <GScan />{busy ? "Sending…" : run ? "Send another and break it" : "Send a lead and break it"}
          </button>
        </div>
        {problem && <p className="fm-error fm-error-form">{problem}</p>}
        {run?.twice && <p className="bk-note"><GCopy size={15} />Sent twice. Both answers named the same waybill, <b>{run.number}</b>: one lead, one contact.</p>}
        {held && (
          <div className="bk-held">
            <p><GHold size={16} />GHL refused the lead, so Fernway held it instead of retrying a lead that won&rsquo;t change by waiting. In the console you would fix the phone number and resend it.</p>
            <button type="button" className="wb-ghost fm-btn" onClick={resendIt} disabled={resending}><GResend size={16} />{resending ? "Resending…" : "Fix it and resend"}</button>
          </div>
        )}
      </div>

      <div className="fm-side" ref={watch}>
        {run ? (
          <Receipt key={`${run.track}-${run.round}`} initial={run.view} token={run.track} to="Stand-in GHL" fast />
        ) : (
          <article className="wb-bill rc-bill fm-preview bk-empty">
            <div className="wb-perf" aria-hidden="true" />
            <p className="wb-label">Waybill</p>
            <p className="wb-no">FW 26 ·····</p>
            <p className="bk-empty-text">Pick what GHL should do, then send. Your waybill fills in here, scan by scan, as Fernway deals with it.</p>
          </article>
        )}
      </div>
    </div>
  );
}
