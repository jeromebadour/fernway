import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { Ago } from "@/ui/ago";
import { GCalendar, GCheck, GHand, GHold, GNodes, GPrice, GRoute, GScan, GStage } from "@/ui/glyphs";
import { RouteEdit, RouteMake, type RouteForm } from "../routes/editor";


// Routes, drawn as routes: each is a line with its stops, from where the lead is picked up to where GHL puts it.
// Pipelines, stages and calendars are named the way GHL has them now. Owners and admins make and change routes.
export async function Routes({ who }: { who: ConsoleWho }) {
  const m = who;
  const [routes, choices] = await Promise.all([who.data.routes(), who.data.choices()]);
  const can = m.role !== "member";
  const lists = "problem" in choices ? null : choices;
  const stageName = (p: string | null, s: string | null) => {
    const pipe = lists?.pipelines.find((x) => x.id === p);
    const st = pipe?.stages.find((x) => x.id === s);
    return pipe && st ? { pipe: pipe.name, stage: st.name, known: true } : { pipe: p ?? "", stage: s ?? "", known: !lists };
  };
  const calName = (c: string | null) => lists?.calendars.find((x) => x.id === c)?.name ?? c;

  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GRoute size={16} />Routes</p>
          <h1 className="ac-h1">Where each lead goes.</h1>
        </div>
        {can && <RouteMake lists={lists} />}
      </header>
      <p className="rt-lede">A form, an embed or your own code names a route. The route says what GHL gets: the contact and its tags, a meeting when the lead picked a time, and the pipeline stage it lands in.</p>
      {"problem" in choices && (
        <p className="rt-warn"><GNodes size={16} />{choices.problem === "not-connected"
          ? <>GHL is not connected, so stages and calendars show by their GHL ids. <Link href={`${who.base}/ghl`}>Connect GHL</Link></>
          : "GHL didn't answer just now, so stages and calendars show by their GHL ids. Reload to ask again."}</p>
      )}

      <ol className="rt-list">
        {routes.map((r) => {
          const st = stageName(r.pipelineId, r.stageId);
          // 100% only when every lead was signed for; 1,375 of 1,378 reads 99.8%, not a rounded 100%.
          const share = r.leads30 ? (r.signed30 === r.leads30 ? "100" : String(Math.min(99.9, Math.floor((r.signed30 / r.leads30) * 1000) / 10))) : null;
          const form: RouteForm = { id: r.id, key: r.key, label: r.label, tags: r.tags, pipelineId: r.pipelineId, stageId: r.stageId, calendarId: r.calendarId };
          return (
            <li key={r.id} id={`route-${r.key}`} className="rt-card">
              <div className="rt-head">
                <code className="rt-key">{r.key}</code>
                <h2 className="rt-name">{r.label}</h2>
                {can && <RouteEdit route={form} lists={lists} />}
              </div>

              <ol className="rt-line" aria-label={`The ${r.label} route, stop by stop`}>
                <li className="rt-stop rt-in">
                  <span className="rt-dot"><GScan size={14} /></span>
                  <b>Picked up</b>
                  <em>route <code>{r.key}</code></em>
                </li>
                <li className="rt-stop rt-in">
                  <span className="rt-dot"><GHand size={14} /></span>
                  <b>Contact</b>
                  <em>{r.tags.length ? r.tags.map((t) => <span key={t} className="rt-tag"><GPrice size={11} />{t}</span>) : "no tags"}</em>
                </li>
                <li className={`rt-stop ${r.calendarId ? "rt-in" : "rt-skip"}`}>
                  <span className="rt-dot"><GCalendar size={14} /></span>
                  <b>Meeting</b>
                  <em>{r.calendarId ? calName(r.calendarId) : "no calendar"}</em>
                </li>
                <li className={`rt-stop ${r.stageId ? (st.known ? "rt-in" : "rt-bad") : "rt-skip"}`}>
                  <span className="rt-dot"><GStage size={14} /></span>
                  <b>Stage</b>
                  <em>{r.stageId ? (st.known ? <><span>{st.pipe}</span><span className="rt-nb"><i>›</i> {st.stage}</span></> : "no longer in GHL") : "no stage set"}</em>
                </li>
                <li className="rt-stop rt-end">
                  <span className="rt-dot"><GCheck size={14} /></span>
                  <b>Signed for</b>
                  <em>{r.stageId ? "when the stage is set" : "when the contact is in"}</em>
                </li>
              </ol>

              <dl className="rt-facts">
                <div><dt>Last 30 days</dt><dd>{r.leads30.toLocaleString("en-US")} {r.leads30 === 1 ? "lead" : "leads"}</dd></div>
                <div><dt>Signed for</dt><dd className={share === null ? "" : "cn-ok"}>{share === null ? "None yet" : `${share}%`}</dd></div>
                <div><dt>Held or returned</dt><dd className={r.held30 ? "cn-hz" : ""}>{r.held30 ? <Link href={`${who.base}/log?state=held`}><GHold size={13} />{r.held30}</Link> : 0}</dd></div>
                <div><dt>Last lead</dt><dd>{r.lastLeadAt ? <Ago iso={r.lastLeadAt} /> : "None yet"}</dd></div>
              </dl>
            </li>
          );
        })}
      </ol>
      {routes.length === 0 && <p className="bl-empty"><GRoute size={16} />No routes yet.{can ? " Make the first one: it names where your form's leads go in GHL." : ""}</p>}
    </>
  );
}
