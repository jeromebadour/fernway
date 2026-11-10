import type { Metadata } from "next";
import { statusView, type Run, type RunKind } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/forms.css";
import "./status.css";
import { delivery } from "@/lib/connect";
import { checkHealth } from "@/lib/health";
import { demoAccount } from "@/lib/intake";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GHand, GHold, GProof, GScan } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { Live } from "./live";

export const metadata: Metadata = {
  title: "Status · Fernway",
  description: "Fernway's live status: its parts, the delivery queue, GoHighLevel's answer times and the backups.",
};
export const dynamic = "force-dynamic";

// Only real numbers, read as the page loads. A section with nothing to show yet says so in one line or is left out.
const REPO = "https://github.com/jeromebadour/fernway";
const HOUR = 3_600_000;
// A run is late when the next one should already have happened: nightly jobs after 26 h, the weekly test after 8 days.
const lateAfter: Record<RunKind, number> = { deploy: Infinity, backup: 26 * HOUR, offsite: 26 * HOUR, restore_test: 8 * 24 * HOUR };
const runNames: [RunKind, string][] = [["backup", "Nightly backup"], ["offsite", "Off-box copy"], ["restore_test", "Restore test"]];

function Stamp({ ok, late }: { ok: boolean; late?: boolean }) {
  if (!ok) return <span className="st-stamp st-bad"><GHold size={13} />Down</span>;
  if (late) return <span className="st-stamp st-bad"><GClock size={13} />Late</span>;
  return <span className="st-stamp st-ok"><GCheck size={13} />Running</span>;
}
// The page's one reading of the clock, taken outside rendering.
const clock = () => Date.now();

function RunStamp({ run, kind, now }: { run: Run; kind: RunKind; now: number }) {
  const late = now - Date.parse(run.at) > lateAfter[kind];
  if (!run.ok) return <span className="st-stamp st-bad"><GHold size={13} />Failed</span>;
  if (late) return <span className="st-stamp st-bad"><GClock size={13} />Late</span>;
  return <span className="st-stamp st-ok"><GCheck size={13} />Passed</span>;
}

export default async function Status() {
  const [health, view] = await Promise.all([checkHealth(), statusView(delivery().db, demoAccount()).catch(() => null)]);
  const now = clock();
  const checkedAt = new Date(now).toISOString();
  const beatAge = health.worker.lastBeat ? now - Date.parse(health.worker.lastBeat) : null;
  const parts = [
    { name: "Website", ok: true, detail: <>Answering this page</> },
    { name: "Database", ok: health.database.ok, detail: health.database.ok ? <>Answering</> : <>Not answering</> },
    { name: "Delivery queue", ok: health.queue.ok, detail: health.queue.ok ? <>Answering</> : <>Not answering</> },
    { name: "Worker", ok: health.worker.ok, detail: health.worker.ok && health.worker.lastBeat ? <>Last beat <Ago iso={health.worker.lastBeat} /></> : <>No beat in the last 30 s</> },
  ];
  const down = parts.filter((p) => !p.ok).map((p) => p.name.toLowerCase());
  const runs = view ? runNames.filter(([k]) => view.runs[k]) : [];
  const slowest = view?.recent.length ? Math.max(...view.recent.map((r) => r.ms)) : 1;

  return (
    <div className="wb">
      <SiteHeader current="/status" />
      <section className="wb-sec st" aria-labelledby="st-h">
        <header className="st-head">
          <p className="wb-eyebrow"><GScan size={16} />Status</p>
          <h1 id="st-h" className="fm-h1">{down.length ? <>The {down.join(" and the ")} {down.length > 1 ? "are" : "is"} down.</> : "Every part is running."}</h1>
          <p className="wb-sec-lede">Live from Fernway&rsquo;s own server: its parts, the delivery queue, GoHighLevel&rsquo;s answer times and the backups. Real numbers only; demo leads are left out, since they never reach GHL.</p>
          <Live checkedAt={checkedAt} />
        </header>

        <div className="st-block">
          <h2>Parts</h2>
          <table className="st-table">
            <thead><tr><th className="st-num">#</th><th>Part</th><th>State</th><th>Detail</th></tr></thead>
            <tbody>
              {parts.map((p, i) => (
                <tr key={p.name} className={p.ok ? "" : "st-row-bad"}>
                  <td className="st-num">{i + 1}</td><td>{p.name}</td><td><Stamp ok={p.ok} late={p.name === "Worker" && beatAge !== null && beatAge > 30_000} /></td><td>{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="st-commit">
            <a href={`${REPO}/commit/${health.commit}`} target="_blank" rel="noopener"><GProof size={15} />Running <code>{health.commit}</code></a>
            {view?.runs.deploy && <>, deployed <Ago iso={view.runs.deploy.at} /></>}
          </p>
        </div>

        {view && (
          <div className="st-block">
            <h2>Deliveries</h2>
            <div className="st-tiles">
              <div className="st-tile"><p className="wb-label">Moving now</p><p className="st-big">{view.queue.moving}</p>
                <p className="st-sub">{view.queue.oldestAt ? <>oldest picked up <Ago iso={view.queue.oldestAt} /></> : "picked up, in transit or waiting"}</p></div>
              <div className="st-tile st-tile-ok"><p className="wb-label">Signed for</p><p className="st-big">{view.queue.signed24h}</p><p className="st-sub">last 24 hours</p></div>
              <div className={`st-tile${view.queue.held24h ? " st-tile-hz" : ""}`}><p className="wb-label">Held</p><p className="st-big">{view.queue.held24h}</p><p className="st-sub">last 24 hours, waiting on a fix</p></div>
              <div className={`st-tile${view.queue.returned24h ? " st-tile-hz" : ""}`}><p className="wb-label">Returned</p><p className="st-big">{view.queue.returned24h}</p><p className="st-sub">last 24 hours, out of tries</p></div>
            </div>
          </div>
        )}

        {view && (
          <div className="st-block">
            <h2>GoHighLevel, last 24 hours</h2>
            {view.ghl ? (
              <>
                <div className="st-tiles">
                  <div className="st-tile"><p className="wb-label">Calls</p><p className="st-big">{view.ghl.calls}</p><p className="st-sub">contacts, notes, meetings, stages</p></div>
                  {view.ghl.medianMs !== null && <div className="st-tile"><p className="wb-label">Typical answer</p><p className="st-big">{view.ghl.medianMs}<em>ms</em></p><p className="st-sub">half the {view.ghl.timed < view.ghl.calls ? `${view.ghl.timed} timed ` : ""}calls were faster</p></div>}
                  {view.ghl.p95Ms !== null && <div className="st-tile"><p className="wb-label">Slow answer</p><p className="st-big">{view.ghl.p95Ms}<em>ms</em></p><p className="st-sub">95 in 100 calls were faster</p></div>}
                  <div className="st-tile st-tile-ok"><p className="wb-label">Answered 2xx</p><p className="st-big">{Math.round((view.ghl.answered2xx / view.ghl.calls) * 100)}<em>%</em></p><p className="st-sub">{view.ghl.answered2xx} of {view.ghl.calls}</p></div>
                </div>
                {view.recent.length > 0 && <table className="st-table st-calls">
                  <thead><tr><th className="st-num">#</th><th>When</th><th>Step</th><th>GHL</th><th>Answer time</th></tr></thead>
                  <tbody>
                    {view.recent.map((r, i) => (
                      <tr key={`${r.at}-${i}`}>
                        <td className="st-num">{i + 1}</td>
                        <td><Ago iso={r.at} /></td>
                        <td><GHand size={13} />{r.step ?? "call"}</td>
                        <td><code className={r.status !== null && r.status < 300 ? "st-c-ok" : "st-c-hz"}>{r.status ?? "none"}</code></td>
                        <td><span className="st-bar"><i style={{ width: `${Math.max(2, (r.ms / slowest) * 100)}%` }} /></span><b>{r.ms} ms</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
              </>
            ) : (
              <p className="st-none">No calls to GHL in the last 24 hours.</p>
            )}
          </div>
        )}

        {runs.length > 0 && (
          <div className="st-block">
            <h2>Backups</h2>
            <table className="st-table">
              <thead><tr><th className="st-num">#</th><th>Run</th><th>Result</th><th>When</th><th>Detail</th></tr></thead>
              <tbody>
                {runs.map(([k, name], i) => {
                  const r = view!.runs[k]!;
                  return (
                    <tr key={k}><td className="st-num">{i + 1}</td><td>{name}</td><td><RunStamp run={r} kind={k} now={now} /></td><td><Ago iso={r.at} /></td><td className="st-detail">{r.detail}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}
