// Incidents (each watcher that went wrong, open first, with who is on it) and staff (who may open this console, as
// what, and the operator audit log). Real console and public demo alike.
import Link from "next/link";
import type { IncidentRow, StaffRow } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import { GCalendar, GCheck, GClock, GHold, GLock, GManifest, GNote, GPlus, GResend, GShield, GTrash, GUser } from "@/ui/glyphs";
import { Pager } from "@/ui/pager";
import { stamp, type When } from "@/ui/when";
import { OpsAction } from "./action";
import { AddStaff } from "./add-staff";
import { watchWords } from "./health";

const lasted = (from: string, to: string | null) => {
  const m = Math.max(1, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 60_000));
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 1440)} days`;
};

export function IncidentsView({ v, w, base, can, demo }: { v: { total: number; page: number; rows: IncidentRow[] }; w: When; base: string; can: boolean; demo?: boolean }) {
  const open = v.rows.filter((i) => !i.closedAt).length;
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GHold size={16} />Incidents</p>
        <h1 className="ac-h1">{open ? `${open} open.` : "Nothing open."}</h1>
      </header>
      <p className="rt-lede">A watcher that goes wrong opens an incident by itself, once; it is raised if it gets worse and closes when the watcher is fine again. Staff acknowledge it so others know someone is on it.</p>
      {v.rows.length === 0 ? <p className="bl-empty"><GCheck size={16} />No incident yet: every watcher has stayed fine.</p> : (
        <ol className="op-inc">
          {v.rows.map((i) => (
            <li key={i.id} className={i.closedAt ? "op-closed" : `op-${i.level}`}>
              <div className="op-inc-top">
                <span className={`cn-stamp ${i.closedAt ? "cn-stamp-ok" : i.level === "down" ? "op-stamp-down" : "cn-stamp-hz"}`}>
                  {i.closedAt ? <><GCheck size={13} />Cleared</> : <><GHold size={13} />{i.level === "down" ? "Down" : "Watch"}</>}
                </span>
                <b>{watchWords[i.watcher] ?? i.watcher}</b>
                <span className="cn-mono op-inc-no">#{i.id}</span>
                {can && !i.closedAt && (
                  <OpsAction demo={demo} small glyph={i.ackBy ? "note" : "user"} label={i.ackBy ? "Add a note" : "Acknowledge"} noteLabel={i.ackBy ? "Note" : "Note, if any"}
                    title={i.ackBy ? `A note on #${i.id}` : `Take #${i.id}?`} path="/api/operator/incidents/ack" body={{ id: i.id }}
                    text={i.ackBy ? <>Notes say what was found or done, for whoever reads it next.</> : <>Everyone on staff sees you are on it. The incident still closes by itself once {watchWords[i.watcher] ?? i.watcher} reads fine.</>} />
                )}
              </div>
              <dl className="op-inc-f">
                <div><dt>Opened</dt><dd className="cn-mono">{stamp(i.openedAt, w)}</dd></div>
                <div><dt>{i.closedAt ? "Lasted" : "Open for"}</dt><dd>{lasted(i.openedAt, i.closedAt)}</dd></div>
                <div><dt>First read</dt><dd>{i.first}</dd></div>
                <div><dt>Worst</dt><dd>{i.worst}</dd></div>
              </dl>
              {(i.ackBy || i.note) && (
                <p className="op-inc-ack"><GUser size={14} /><span>{i.ackBy ? <><b>{i.ackBy}</b> took it {i.ackAt ? <Ago iso={i.ackAt} /> : null}{i.note ? ": " : "."}</> : null}{i.note}</span></p>
              )}
            </li>
          ))}
        </ol>
      )}
      <Pager path={`${base}/incidents`} page={v.page} total={v.total} />
    </>
  );
}

const roleLine: Record<string, string> = {
  owner: "Everything, staff included", support: "Looks, and acts on accounts and incidents", viewer: "Looks only",
};
type G = (p: { size?: number }) => React.ReactNode;
const actionWords: Record<string, { word: string; G: G; tone: string }> = {
  "staff.added": { word: "Added to staff", G: GPlus, tone: "ok" },
  "staff.role": { word: "Changed a staff role", G: GShield, tone: "in" },
  "staff.removed": { word: "Removed from staff", G: GTrash, tone: "hz" },
  "account.synced": { word: "Synced with Stripe", G: GResend, tone: "re" },
  "account.trial_extended": { word: "Extended a trial", G: GCalendar, tone: "in" },
  "incident.acknowledged": { word: "Took an incident", G: GUser, tone: "hz" },
  "incident.noted": { word: "Noted an incident", G: GNote, tone: "in" },
};

type Audit = { total: number; page: number; rows: { id: number; who: string; action: string; account: string | null; accountId: number | null; target: string | null; detail: string; at: string }[] };
export function StaffView({ staff, audit, me, w, base, demo }: { staff: StaffRow[]; audit: Audit; me: { userId: number; role: string }; w: When; base: string; demo?: boolean }) {
  const owner = me.role === "owner";
  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GShield size={16} />Staff</p>
          <h1 className="ac-h1">Who runs Fernway.</h1>
        </div>
        {owner && <AddStaff demo={demo} />}
      </header>
      <p className="rt-lede">Staff open this console only with two-step sign-in on; for anyone else it doesn&apos;t exist. Every action asks for a fresh code and is written below.</p>
      <table className="bl-table tm-table op-staff">
        <thead><tr><th>Person</th><th>Role</th><th>Two-step</th><th>Added</th><th>Last seen</th><th><span className="bl-sr">Change</span></th></tr></thead>
        <tbody>{staff.map((s) => (
          <tr key={s.userId}>
            <td><span className="tm-who"><span className="wb-ava tm-ava op-ava">{s.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span><b>{s.name}{s.userId === me.userId && <i className="tm-you">you</i>}</b><em>{s.email}</em></span></span></td>
            <td className="tm-role"><span className={`tm-badge op-role-${s.role}`}><GShield size={13} />{s.role.charAt(0).toUpperCase() + s.role.slice(1)}</span><em>{roleLine[s.role]}</em></td>
            <td>{s.twoStep ? <span className="bl-chip bl-chip-ok"><GLock size={13} />On</span> : <span className="bl-chip bl-chip-hz"><GHold size={13} />Off: no access</span>}</td>
            <td className="cn-mono">{s.addedBy ? <>{stamp(s.addedAt, w).split(",")[0]}<em className="op-block">by {s.addedBy}</em></> : stamp(s.addedAt, w).split(",")[0]}</td>
            <td>{s.lastSeenAt ? <Ago iso={s.lastSeenAt} /> : <span className="tm-off">Not yet</span>}</td>
            <td className="bl-links">{owner && s.role !== "owner" && (
              <div className="op-links">
                <OpsAction demo={demo} small glyph="shield" label={s.role === "support" ? "Make viewer" : "Make support"} title={`${s.name} as ${s.role === "support" ? "viewer" : "support"}?`}
                  path="/api/operator/staff/role" body={{ userId: s.userId, role: s.role === "support" ? "viewer" : "support" }}
                  text={s.role === "support" ? <>They keep looking but can no longer act on accounts or incidents.</> : <>They can then sync accounts with Stripe, extend trials and take incidents, each with a code.</>} />
                <OpsAction demo={demo} small stop glyph="trash" label="Remove" title={`Remove ${s.name} from staff?`} path="/api/operator/staff/remove" body={{ userId: s.userId }}
                  text={<>The operator console stops existing for them at once. Their Fernway account, if they have one, stays as it is.</>} />
              </div>
            )}</td>
          </tr>
        ))}</tbody>
      </table>

      <section className="bl-sec" aria-labelledby="op-au-h">
        <h2 id="op-au-h" className="bl-h2"><GManifest size={18} />What staff did</h2>
        {audit.rows.length === 0 ? <p className="bl-empty"><GManifest size={16} />Nothing yet. Every staff action is written here.</p> : (
          <table className="bl-table ad-table">
            <thead><tr><th className="bl-num">#</th><th>When</th><th>Who</th><th>What</th><th>On</th><th>Details</th></tr></thead>
            <tbody>{audit.rows.map((r, i) => (
              <tr key={r.id}>
                <td className="bl-num">{audit.total - (audit.page - 1) * 15 - i}</td>
                <td className="cn-mono">{stamp(r.at, w)}</td>
                <td className="cn-who">{r.who}</td>
                <td>{(() => { const a = actionWords[r.action] ?? { word: r.action, G: GClock, tone: "in" }; return <span className={`ad-what cn-${a.tone}`}><a.G size={14} />{a.word}</span>; })()}</td>
                <td>{r.accountId ? <Link className="ad-t" href={`${base}/accounts/${r.accountId}`}>{r.account ?? r.target}</Link> : r.target}</td>
                <td className="ad-detail">{r.detail}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pager path={`${base}/staff`} page={audit.page} total={audit.total} />
      </section>
    </>
  );
}
