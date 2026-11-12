import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { scoreTag, scoreWords } from "@fernway/delivery";
import { GCheck, GClock, GClose, GNote, GScore, GPrice, GShield } from "@/ui/glyphs";
import { day, stamp } from "@/ui/when";
import { ScoreToggle } from "../score/toggle";

/** The colour of each score: delivered green for the best, then the action mint, input blue, held amber, and the
 *  "ends something" red for the least likely (BUILD-RULES 2.2 meanings). */
export const scoreTone: Record<number, string> = { 5: "s5", 4: "s4", 3: "s3", 2: "s2", 1: "s1" };
export const usd = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

// Lead score: Claude reads each new lead and scores it from 1 to 5 with its reasons. The page says whether it is on,
// how this month's leads scored, how to use the score in GHL (its tags and its note), exactly what Claude is sent,
// and the latest scores.
export async function Score({ who }: { who: ConsoleWho }) {
  const v = await who.data.score();
  const w = who.when;
  const can = who.role !== "member";
  const m = v.month;
  const facts = [
    { k: "Scored this month", v: m.scored.toLocaleString("en-US"), tone: "" },
    { k: "Average score", v: m.average === null ? "None yet" : m.average.toFixed(1), tone: "" },
    { k: "On GHL contacts", v: m.inGhl.toLocaleString("en-US"), tone: m.inGhl ? "cn-ok" : "" },
    { k: "Claude is reading", v: String(m.waiting), tone: "" },
    { k: "Not scored", v: String(m.notScored), tone: m.notScored ? "cn-hz" : "" },
    { k: "Claude's cost", v: usd(m.costUsd), tone: "" },
  ];

  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GScore size={16} />Lead score</p>
          <h1 className="ac-h1">Who to call first.</h1>
        </div>
        <div className="ls-head-do">
          <span className={`bl-chip ${v.on ? "bl-chip-ok" : "bl-chip-in"}`}>{v.on ? <GCheck size={13} /> : <GClose size={13} />}{v.on ? `On since ${day(v.since!, w)}` : "Off"}</span>
          {can && <ScoreToggle on={v.on} />}
        </div>
      </header>
      <p className="rt-lede">Claude reads each new lead and gives it a score from 1 to 5, with a line on who it is and the reasons. The score lands on the GHL contact as a note and a tag, so a GHL workflow can call your best leads first.</p>

      <section className="ls-tiles" aria-label="This month's leads by score">
        {[5, 4, 3, 2, 1].map((n) => {
          const c = m.byScore[n as 1 | 2 | 3 | 4 | 5];
          return (
            <div key={n} className={`ls-tile ls-${scoreTone[n]}${c === 0 ? " cn-zero" : ""}`}>
              <span className="ls-tile-k"><Pips n={n} />{scoreWords[n]}</span>
              <b>{c.toLocaleString("en-US")}</b>
              <span className="ls-tile-l">scored {n} this month</span>
            </div>
          );
        })}
      </section>
      <dl className="cn-facts ls-facts">
        {facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd className={f.tone}>{f.v}</dd></div>)}
      </dl>

      <div className="cn-two ls-two">
        <section aria-labelledby="ls-ghl-h">
          <h2 id="ls-ghl-h" className="bl-h2"><GPrice size={18} />Use it in GHL</h2>
          <p className="ls-p">Each scored contact carries one score tag, its latest. In a GHL workflow, start on <b>Contact Tag</b> added with the tag you want.</p>
          <ul className="ls-tags">
            {[5, 4, 3, 2, 1].map((n) => (
              <li key={n} className={`ls-${scoreTone[n]}`}><code>{scoreTag(n)}</code><Pips n={n} /><span>{scoreWords[n]}</span></li>
            ))}
          </ul>
          <p className="ls-k"><GNote size={14} />The note on the contact</p>
          <pre className="ls-note">{`Fernway lead score: 5 of 5 (Ready to buy)
A runner with a sore knee asking for the first free slot.
· Asks for a slot this week
· Clear injury, clear need
Read by Claude for waybill FW 26 18392.`}</pre>
        </section>

        <section aria-labelledby="ls-sent-h">
          <h2 id="ls-sent-h" className="bl-h2"><GShield size={18} />What Claude reads</h2>
          <div className="ls-sent">
            <div>
              <p className="ls-k ls-yes"><GCheck size={14} />Sent</p>
              <ul>
                <li>Your business&apos;s name and the route</li>
                <li>Where the lead came from</li>
                <li>Company and website</li>
                <li>The email&apos;s domain, and whether it is a free mailbox</li>
                <li>Whether a phone or a meeting was given</li>
                <li>The message</li>
              </ul>
            </div>
            <div>
              <p className="ls-k ls-no"><GClose size={14} />Never sent</p>
              <ul>
                <li>The person&apos;s name</li>
                <li>Their email address</li>
                <li>Their phone number</li>
              </ul>
            </div>
          </div>
          <p className="ls-p ls-small">The lead&apos;s own words are read as data, never as instructions. Claude Haiku 5.5, through Anthropic&apos;s API, which does not train on it.</p>
        </section>
      </div>

      <section className="bl-sec" aria-labelledby="ls-latest-h">
        <h2 id="ls-latest-h" className="bl-h2"><GClock size={18} />Latest scores</h2>
        {v.latest.length === 0 ? (
          <p className="bl-empty"><GScore size={16} />{v.on ? "No lead scored yet. The next lead appears here a few seconds after it is picked up." : "Lead score is off. Turn it on and new leads are scored from then on."}</p>
        ) : (
          <table className="bl-table ls-table">
            <thead><tr><th className="bl-num">#</th><th>Scored</th><th>Waybill</th><th>Lead</th><th>Score</th><th>Claude&apos;s read</th></tr></thead>
            <tbody>
              {v.latest.map((r, i) => (
                <tr key={r.shipmentId}>
                  <td className="bl-num">{i + 1}</td>
                  <td className="cn-mono">{stamp(r.at, w)}</td>
                  <td><Link className="cn-wb" href={`${who.base}/lead/${r.shipmentId}`}>{r.waybill}</Link></td>
                  <td className="cn-who">{r.who}</td>
                  <td><ScoreChip n={r.score} /></td>
                  <td className="ls-read">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/** Five pips, the first n lit, in the score's colour. */
export function Pips({ n }: { n: number }) {
  return <span className="ls-pips" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</span>;
}

export function ScoreChip({ n, word = true }: { n: number; word?: boolean }) {
  return <span className={`ls-chip ls-${scoreTone[n]}`} title={`${n} of 5: ${scoreWords[n]}`}><b>{n}</b><Pips n={n} />{word && <span>{scoreWords[n]}</span>}</span>;
}
