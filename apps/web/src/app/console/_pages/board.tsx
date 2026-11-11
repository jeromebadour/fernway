import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import type { boardView } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GGrid, GHold, GJump, GManifest, GResend, GRoute, GScan } from "@/ui/glyphs";
import { time, type When } from "@/ui/when";
import { ResendButton } from "../actions";
import { stateWord } from "../states";


// The delivery board, read like a carrier's: where every lead is right now, the last 24 hours hour by hour, the lead
// that has waited longest, what GHL is refusing and why (with Resend for each reason), and the latest movements.
export async function Board({ who }: { who: ConsoleWho }) {
  const w = who.when;
  const b = await who.data.board();
  const peak = Math.max(1, ...b.perHour.map((h) => h.signed + h.held));
  const tiles = [
    { k: "moving", label: "Moving now", n: b.moving, G: GRoute, tone: "in", line: "Picked up or with GHL" },
    { k: "waiting", label: "Waiting for a retry", n: b.waiting, G: GResend, tone: "re", line: "GHL said not now" },
    { k: "held", label: "Held", n: b.held, G: GHold, tone: "hz", line: "GHL refused; needs a fix" },
    { k: "returned", label: "Returned", n: b.returned, G: GHold, tone: "hz", line: "8 tries went unanswered" },
  ];
  const sec = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GGrid size={16} />Delivery board</p>
        <h1 className="ac-h1">Every lead, where it is now.</h1>
      </header>

      <section className="cn-tiles" aria-label="Where leads are">
        {tiles.map((t) => (
          <Link key={t.k} href={`${who.base}/log?state=${t.k}`} className={`cn-tile cn-${t.tone}${t.n === 0 ? " cn-zero" : ""}`}>
            <span className="cn-tile-k"><t.G size={15} />{t.label}</span>
            <b>{t.n.toLocaleString("en-US")}</b>
            <span className="cn-tile-l">{t.line}</span>
          </Link>
        ))}
      </section>

      <section className="cn-day" aria-labelledby="cn-day-h">
        <div className="cn-day-head">
          <h2 id="cn-day-h" className="bl-h2"><GManifest size={18} />The last 24 hours</h2>
          <dl className="cn-facts">
            <div><dt>Signed for</dt><dd className="cn-ok">{b.signed24h.toLocaleString("en-US")}</dd></div>
            <div><dt>Held or returned</dt><dd className={b.heldOrReturned24h ? "cn-hz" : ""}>{b.heldOrReturned24h}</dd></div>
            <div><dt>On the first try</dt><dd>{b.firstTryShare === null ? "None yet" : `${Math.round(b.firstTryShare * 100)}%`}</dd></div>
            <div><dt>Typical time to sign</dt><dd>{b.medianSignMs === null ? "None yet" : sec(b.medianSignMs)}</dd></div>
          </dl>
        </div>
        <div className="cn-bars" role="img" aria-label={`Leads per hour over the last 24 hours: ${b.signed24h} signed for, ${b.heldOrReturned24h} held or returned`}>
          {b.perHour.map((h) => (
            <div key={h.hour} className="cn-bar" title={`${time(h.hour, w)}: ${h.signed} signed for${h.held ? `, ${h.held} held or returned` : ""}`}>
              <i className="cn-bar-hz" style={{ height: `${(h.held / peak) * 100}%` }} />
              <i className="cn-bar-ok" style={{ height: `${(h.signed / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="cn-bars-x"><span>{time(b.perHour[0]!.hour, w)}</span><span>{time(b.perHour[12]!.hour, w)}</span><span>Now</span></div>
      </section>

      <div className="cn-two">
        <section aria-labelledby="cn-old-h">
          <h2 id="cn-old-h" className="bl-h2"><GClock size={18} />Waiting longest</h2>
          {b.oldestWaiting ? (
            <Link className="cn-oldest" href={`${who.base}/lead/${b.oldestWaiting.shipmentId}`}>
              <span className="cn-oldest-wb">{b.oldestWaiting.waybill}</span>
              <span className="cn-oldest-l">Picked up <Ago iso={b.oldestWaiting.since} />, {b.oldestWaiting.tries} of 8 tries made{b.oldestWaiting.nextAt ? <>, next at {time(b.oldestWaiting.nextAt, w)}</> : null}.</span>
              <span className="cn-go"><GJump size={14} />Open</span>
            </Link>
          ) : <p className="bl-empty"><GCheck size={16} />Nothing is waiting: every lead has been signed for, held or returned.</p>}
        </section>

        <section aria-labelledby="cn-why-h">
          <h2 id="cn-why-h" className="bl-h2"><GHold size={18} />Why GHL is refusing</h2>
          {b.holdReasons.length === 0 ? <p className="bl-empty"><GCheck size={16} />No lead is held.</p> : (
            <ul className="cn-why">
              {b.holdReasons.map((r) => (
                <li key={r.reason}>
                  <b className="cn-why-n">{r.count}</b>
                  <span className="cn-why-r">{r.reason}<em>latest <Ago iso={r.latest} /></em></span>
                  <ResendButton reason={r.reason} count={r.count} label={r.count === 1 ? "Resend" : `Resend ${r.count}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bl-sec" aria-labelledby="cn-recent-h">
        <div className="cn-sec-head">
          <h2 id="cn-recent-h" className="bl-h2"><GScan size={18} />Latest movements</h2>
          <Link className="ky-docs" href={`${who.base}/log`}><GManifest size={15} />The whole sync log</Link>
        </div>
        <Movements rows={b.recent} w={w} base={who.base} />
      </section>
    </>
  );
}

function Movements({ rows, w, base }: { rows: Awaited<ReturnType<typeof boardView>>["recent"]; w: When; base: string }) {
  if (rows.length === 0) return <p className="bl-empty"><GManifest size={16} />No leads yet. They appear here the moment Fernway picks one up.</p>;
  return (
    <table className="bl-table cn-moves">
      <thead><tr><th className="bl-num">#</th><th>Time</th><th>Waybill</th><th>Lead</th><th>Route</th><th>State</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const s = stateWord(r.state, r.tries);
          return (
            <tr key={r.shipmentId}>
              <td className="bl-num">{i + 1}</td>
              <td className="cn-mono">{time(r.at, w)}</td>
              <td><Link className="cn-wb" href={`${base}/lead/${r.shipmentId}`}>{r.waybill}</Link></td>
              <td className="cn-who">{r.who}</td>
              <td>{r.route}</td>
              <td><span className={`bl-chip bl-chip-${s.tone}`}><s.G size={13} />{s.word}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
