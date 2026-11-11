// The operator's health views: the overview (watchers, parts, the box, the service in numbers, open incidents, the
// last runs), the queue, and GHL across every account. The same views serve the real console and the public demo.
import Link from "next/link";
import type { BoxReading, IncidentRow, Watch } from "@fernway/delivery";
import type { ghlView, overviewView, queueView } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import {
  GBuilding, GCheck, GClock, GDepot, GDevice, GGrid, GHold, GJump, GManifest, GNodes, GPackage, GResend, GRoute, GSave, GScan, GUser,
} from "@/ui/glyphs";
import { time, type When } from "@/ui/when";

import { watcherLabels } from "@fernway/delivery";
export const watchWords = watcherLabels;
const stateWord = { ok: "Fine", warn: "Watch", down: "Down" } as const;
const bytes = (b: number | null) => b === null ? "Unknown" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fmt = (v: number) => v.toLocaleString("en-US");

type Overview = Awaited<ReturnType<typeof overviewView>>;
export function OverviewView({ box, watches, o, open, base }: { box: BoxReading; watches: Watch[]; o: Overview; open: IncidentRow[]; base: string }) {
  const bad = watches.filter((x) => x.state !== "ok");
  const mem = pct(box.memUsed, box.memTotal), disk = pct(box.diskUsed, box.diskTotal), load = box.cpus ? Math.round((box.load1 / box.cpus) * 100) : 0;
  const runWords: [string, string][] = [["deploy", "Deploy"], ["backup", "Nightly backup"], ["offsite", "Off-box copy"], ["restore_test", "Restore test"]];
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GGrid size={16} />Overview</p>
        <h1 className="ac-h1">{bad.length === 0 ? "Every part is fine." : `${bad.length} ${bad.length === 1 ? "watcher needs" : "watchers need"} a look.`}</h1>
      </header>

      <section aria-label="Watchers" className="op-watch">
        {watches.map((x) => (
          <div key={x.key} className={`op-w op-${x.state}`}>
            <span className="op-w-k">{x.state === "ok" ? <GCheck size={14} /> : <GHold size={14} />}{x.label}<i>{stateWord[x.state]}</i></span>
            <b>{x.reading}</b>
            <em>Expected: {x.limit}</em>
          </div>
        ))}
      </section>

      {open.length > 0 && (
        <section className="bl-sec" aria-labelledby="op-open-h">
          <div className="cn-sec-head">
            <h2 id="op-open-h" className="bl-h2"><GHold size={18} />Open incidents</h2>
            <Link className="ky-docs" href={`${base}/incidents`}><GJump size={15} />Every incident</Link>
          </div>
          <ul className="op-open">
            {open.map((i) => (
              <li key={i.id} className={`op-${i.level}`}>
                <GHold size={16} />
                <span><b>{watchWords[i.watcher] ?? i.watcher}</b><em>opened <Ago iso={i.openedAt} />, worst {i.worst}</em></span>
                <span className="op-ack">{i.ackBy ? <><GUser size={13} />{i.ackBy} is on it</> : <><GClock size={13} />Not acknowledged</>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bl-sec" aria-labelledby="op-parts-h">
        <h2 id="op-parts-h" className="bl-h2"><GDepot size={18} />Parts</h2>
        <dl className="op-parts">
          <div><dt><GGrid size={13} />Website</dt><dd><code>{box.webCommit}</code></dd><dd className="op-sub">answering this page</dd></div>
          <div className={box.workerBeatAt ? "" : "op-bad"}><dt><GPackage size={13} />Worker</dt><dd><code>{box.workerCommit ?? "none"}</code></dd>
            <dd className="op-sub">{box.workerBeatAt ? <>beat <Ago iso={box.workerBeatAt} /></> : "no beat"}{box.workerCommit && box.workerCommit !== box.webCommit ? ", not the website's commit" : ""}</dd></div>
          <div><dt><GSave size={13} />Database</dt><dd>{bytes(o.dbBytes)}</dd><dd className="op-sub">{fmt(o.accounts)} accounts, {fmt(o.people)} people</dd></div>
          <div className={box.redisBytes === null ? "op-bad" : ""}><dt><GResend size={13} />Redis</dt><dd>{bytes(box.redisBytes)}</dd><dd className="op-sub">{box.jobs ? `${fmt(box.jobs.waiting + box.jobs.delayed)} jobs queued, ${box.jobs.failed} failed` : "not answering"}</dd></div>
        </dl>
      </section>

      <section className="bl-sec" aria-labelledby="op-box-h">
        <h2 id="op-box-h" className="bl-h2"><GDevice size={18} />The box</h2>
        <div className="op-meters">
          <Meter label="Processor" value={load} line={`load ${box.load1.toFixed(2)} on ${box.cpus} cores`} warn={85} />
          <Meter label="Memory" value={mem} line={`${bytes(box.memUsed)} of ${bytes(box.memTotal)}`} warn={90} />
          <Meter label="Disk" value={disk} line={`${bytes(box.diskUsed)} of ${bytes(box.diskTotal)}`} warn={80} />
        </div>
      </section>

      <div className="cn-two">
        <section aria-labelledby="op-num-h">
          <h2 id="op-num-h" className="bl-h2"><GBuilding size={18} />The service</h2>
          <dl className="op-nums">
            <div><dt>Accounts</dt><dd>{fmt(o.accounts)}</dd></div>
            <div><dt>Paying</dt><dd className="cn-ok">{fmt(o.paying)}</dd></div>
            <div><dt>On trial</dt><dd>{fmt(o.trial)}</dd></div>
            <div><dt>Leads, 24 h</dt><dd>{fmt(o.leads24)}</dd></div>
            <div><dt>Signed, 24 h</dt><dd className="cn-ok">{fmt(o.signed24)}</dd></div>
            <div><dt>Held, 24 h</dt><dd className={o.held24 ? "cn-hz" : ""}>{fmt(o.held24)}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="op-runs-h">
          <h2 id="op-runs-h" className="bl-h2"><GManifest size={18} />Last runs</h2>
          <ul className="op-runs">
            {runWords.map(([k, word]) => {
              const r = o.runs[k];
              return (
                <li key={k} className={!r ? "op-none" : r.ok ? "" : "op-down"}>
                  {r && r.ok ? <GCheck size={15} /> : <GHold size={15} />}
                  <span><b>{word}</b><em>{r ? r.detail : "not run yet"}</em></span>
                  <span className="cn-mono">{r ? <Ago iso={r.at} /> : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

function Meter({ label, value, line, warn }: { label: string; value: number; line: string; warn: number }) {
  const tone = value > warn ? "hz" : "ok";
  return (
    <div className="op-meter">
      <p><b>{label}</b><span className={`cn-${tone}`}>{value}%</span></p>
      <div className="op-bar" role="img" aria-label={`${label} ${value}%`}><i className={`op-fill-${tone}`} style={{ width: `${Math.min(100, value)}%` }} /><s style={{ left: `${warn}%` }} /></div>
      <em>{line}</em>
    </div>
  );
}

type Queue = Awaited<ReturnType<typeof queueView>>;
export function QueueView({ q, box, w, base }: { q: Queue; box: BoxReading; w: When; base: string }) {
  const peak = Math.max(1, ...q.perHour.map((h) => h.tries));
  const tiles = [
    { label: "Picked up", n: q.pickedUp, tone: "in", G: GScan, line: "not tried yet" },
    { label: "With GHL", n: q.inTransit, tone: "in", G: GRoute, line: "a try running" },
    { label: "Waiting", n: q.waiting, tone: "re", G: GResend, line: q.nextAt ? `next at ${time(q.nextAt, w)}` : "nothing booked" },
    { label: "Overdue", n: q.overdue, tone: q.overdue ? "hz" : "ok", G: GClock, line: "over 5 min late" },
  ];
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GRoute size={16} />Queue</p>
        <h1 className="ac-h1">{q.overdue ? `${q.overdue} ${q.overdue === 1 ? "try is" : "tries are"} late.` : "Every try on time."}</h1>
      </header>
      <section className="cn-tiles" aria-label="Where the tries are">
        {tiles.map((t) => (
          <div key={t.label} className={`cn-tile cn-${t.tone}${t.n === 0 ? " cn-zero" : ""}`}>
            <span className="cn-tile-k"><t.G size={15} />{t.label}</span><b>{fmt(t.n)}</b><span className="cn-tile-l">{t.line}</span>
          </div>
        ))}
      </section>
      <section className="cn-day" aria-labelledby="op-q-h">
        <div className="cn-day-head">
          <h2 id="op-q-h" className="bl-h2"><GManifest size={18} />Calls to GHL per hour, 24 h</h2>
          <dl className="cn-facts">
            <div><dt>Queue jobs</dt><dd>{box.jobs ? fmt(box.jobs.waiting + box.jobs.delayed) : "Unknown"}</dd></div>
            <div><dt>Running</dt><dd>{box.jobs ? box.jobs.active : "Unknown"}</dd></div>
            <div><dt>Failed jobs</dt><dd className={box.jobs?.failed ? "cn-hz" : ""}>{box.jobs ? box.jobs.failed : "Unknown"}</dd></div>
            <div><dt>Oldest moving</dt><dd>{q.oldestAt ? <Ago iso={q.oldestAt} /> : "None"}</dd></div>
          </dl>
        </div>
        <div className="cn-bars" role="img" aria-label="Calls to GHL per hour over the last 24 hours">
          {q.perHour.map((h) => (
            <div key={h.hour} className="cn-bar" title={`${time(h.hour, w)}: ${h.tries} calls, ${h.signed} signed for`}>
              <i className="cn-bar-ok" style={{ height: `${(h.tries / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="cn-bars-x"><span>{time(q.perHour[0]!.hour, w)}</span><span>{time(q.perHour[12]!.hour, w)}</span><span>Now</span></div>
      </section>
      <section className="bl-sec" aria-labelledby="op-qa-h">
        <h2 id="op-qa-h" className="bl-h2"><GBuilding size={18} />By account</h2>
        {q.byAccount.length === 0 ? <p className="bl-empty"><GCheck size={16} />No account has a lead moving or held.</p> : (
          <table className="bl-table op-table">
            <thead><tr><th className="bl-num">#</th><th>Account</th><th>Moving</th><th>Waiting</th><th>Held</th></tr></thead>
            <tbody>{q.byAccount.map((a, i) => (
              <tr key={a.id}><td className="bl-num">{i + 1}</td><td><Link className="op-acc" href={`${base}/accounts/${a.id}`}>{a.name}<em>AC {String(a.id).padStart(6, "0")}</em></Link></td>
                <td className="cn-mono op-in">{a.moving}</td><td className="cn-mono op-re">{a.waiting}</td><td className={`cn-mono ${a.held ? "op-hz" : ""}`}>{a.held}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}

type Ghl = Awaited<ReturnType<typeof ghlView>>;
const stepWords: Record<string, string> = { contact: "Contact", note: "Note", appointment: "Meeting", opportunity: "Pipeline" };
export function GhlView({ g, base }: { g: Ghl; base: string }) {
  const part = (v: number) => (g.calls ? `${(v / g.calls) * 100}%` : "0");
  const needs = g.connections.filter((c) => c.status !== "connected").length;
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GNodes size={16} />GHL</p>
        <h1 className="ac-h1">{needs ? `${needs} ${needs === 1 ? "connection needs" : "connections need"} reconnecting.` : "Every connection is good."}</h1>
      </header>
      <section className="gh-health op-first" aria-labelledby="op-g-h">
        <div className="cn-day-head">
          <h2 id="op-g-h" className="bl-h2"><GClock size={18} />Every account&apos;s calls, 24 h</h2>
          <dl className="cn-facts">
            <div><dt>Calls</dt><dd>{fmt(g.calls)}</dd></div>
            <div><dt>Typical</dt><dd>{g.p50 === null ? "None" : `${g.p50} ms`}</dd></div>
            <div><dt>Slow (95th)</dt><dd>{g.p95 === null ? "None" : `${g.p95} ms`}</dd></div>
          </dl>
        </div>
        <div className="gh-bar" role="img" aria-label={`${g.ok} accepted, ${g.refused} refused, ${g.failed + g.none} failed or unanswered`}>
          <i className="gh-ok" style={{ width: part(g.ok) }} /><i className="gh-hz" style={{ width: part(g.refused) }} /><i className="gh-re" style={{ width: part(g.failed + g.none) }} />
        </div>
        <ul className="gh-key">
          <li><i className="gh-ok" /><b>{fmt(g.ok)}</b>accepted</li>
          <li><i className="gh-hz" /><b>{fmt(g.refused)}</b>refused (4xx)</li>
          <li><i className="gh-re" /><b>{fmt(g.failed + g.none)}</b>failed or unanswered</li>
        </ul>
        {g.byStep.length > 0 && (
          <dl className="op-steps">{g.byStep.map((s) => (
            <div key={s.step}><dt>{stepWords[s.step] ?? s.step}</dt><dd>{fmt(s.calls)} calls</dd><dd className="op-sub">{s.p50 === null ? "untimed" : `${s.p50} ms typical`}{s.bad ? `, ${s.bad} not accepted` : ""}</dd></div>
          ))}</dl>
        )}
      </section>

      <section className="bl-sec" aria-labelledby="op-c-h">
        <h2 id="op-c-h" className="bl-h2"><GNodes size={18} />Connections</h2>
        {g.connections.length === 0 ? <p className="bl-empty"><GNodes size={16} />No account has connected GHL yet.</p> : (
          <table className="bl-table op-table op-conns">
            <thead><tr><th>Account</th><th>Sub-account</th><th>Token</th><th>Calls, 24 h</th><th>Renewed</th></tr></thead>
            <tbody>{g.connections.map((c) => (
              <tr key={c.accountId}>
                <td><Link className="op-acc" href={`${base}/accounts/${c.accountId}`}>{c.name}<em>AC {String(c.accountId).padStart(6, "0")}</em></Link></td>
                <td className="cn-mono">{c.location}</td>
                <td>{c.status === "connected" ? <span className="bl-chip bl-chip-ok"><GCheck size={13} />Good</span>
                  : <><span className="bl-chip bl-chip-hz"><GHold size={13} />Reconnect</span>{c.error && <em className="cn-reason">{c.error}</em>}</>}</td>
                <td className="cn-mono">{fmt(c.calls)}{c.bad ? <span className="op-hz">, {c.bad} not accepted</span> : ""}</td>
                <td>{c.refreshedAt ? <Ago iso={c.refreshedAt} /> : <span className="tm-off">Not yet</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="bl-sec" aria-labelledby="op-r-h">
        <h2 id="op-r-h" className="bl-h2"><GHold size={18} />Why leads are held, every account</h2>
        {g.reasons.length === 0 ? <p className="bl-empty"><GCheck size={16} />No lead is held anywhere.</p> : (
          <ul className="cn-why op-why">
            {g.reasons.map((r) => (
              <li key={r.reason}><b className="cn-why-n">{fmt(r.n)}</b><span className="cn-why-r">{r.reason}<em>{r.accounts} {r.accounts === 1 ? "account" : "accounts"}</em></span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

