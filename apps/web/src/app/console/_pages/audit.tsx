import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { auditGroups, type AuditGroup } from "@fernway/delivery";
import { GCard, GKey, GMail, GNodes, GRecord, GResend, GRoute, GShield, GSignUp, GTrash, GUser } from "@/ui/glyphs";
import { Pager } from "@/ui/pager";
import { stamp } from "@/ui/when";


type G = (p: { size?: number }) => React.ReactNode;
const said: Record<string, { word: string; G: G; tone: string }> = {
  "lead.resent": { word: "Resent a lead", G: GResend, tone: "re" },
  "leads.resent": { word: "Resent held leads", G: GResend, tone: "re" },
  "route.made": { word: "Made a route", G: GRoute, tone: "in" },
  "route.changed": { word: "Changed a route", G: GRoute, tone: "in" },
  "ghl.connected": { word: "Connected GHL", G: GNodes, tone: "ok" },
  "ghl.disconnected": { word: "Disconnected GHL", G: GNodes, tone: "hz" },
  "member.invited": { word: "Invited someone", G: GSignUp, tone: "in" },
  "member.joined": { word: "Joined the team", G: GUser, tone: "ok" },
  "member.role": { word: "Changed a role", G: GShield, tone: "in" },
  "member.removed": { word: "Removed someone", G: GTrash, tone: "hz" },
  "invite.cancelled": { word: "Cancelled an invite", G: GMail, tone: "hz" },
  "key.made": { word: "Made an API key", G: GKey, tone: "in" },
  "key.revoked": { word: "Revoked an API key", G: GKey, tone: "hz" },
  "plan.changed": { word: "Changed the plan", G: GCard, tone: "in" },
};
const groups: { k: AuditGroup | "all"; label: string }[] = [
  { k: "all", label: "All" }, { k: "leads", label: "Leads" }, { k: "routes", label: "Routes" }, { k: "ghl", label: "GHL" },
  { k: "team", label: "Team" }, { k: "keys", label: "API keys" }, { k: "plan", label: "Plan" },
];

// The audit log: who did what in this account and when, newest first, 15 a page. Each line points at what it touched.
export async function Audit({ who, searchParams }: { who: ConsoleWho; searchParams: Promise<{ page?: string; group?: string }> }) {
  const w = who.when;
  const sp = await searchParams;
  const group = (Object.keys(auditGroups) as AuditGroup[]).find((g) => g === sp.group);
  const v = await who.data.audit(Number(sp.page) || 1, group);
  const leads = new Map<string, number | null>();
  for (const r of v.rows) if (r.targetKind === "lead" && r.targetId && !leads.has(r.targetId)) leads.set(r.targetId, await who.data.waybillId(r.targetId));

  const target = (r: (typeof v.rows)[number]) => {
    if (!r.targetId) return null;
    if (r.targetKind === "lead") { const id = leads.get(r.targetId); return id ? <Link className="cn-wb" href={`${who.base}/lead/${id}`}>{r.targetId}</Link> : <code>{r.targetId}</code>; }
    if (r.targetKind === "route") return <Link className="ad-t" href={`${who.base}/routes#route-${r.targetId}`}><code>{r.targetId}</code></Link>;
    if (r.targetKind === "ghl") return <Link className="ad-t" href={`${who.base}/ghl`}><code>{r.targetId}</code></Link>;
    if (r.targetKind === "member") return <Link className="ad-t" href={`${who.base}/team`}>Team</Link>;
    return <code>{r.targetId}</code>;
  };

  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GRecord size={16} />Audit log</p>
        <h1 className="ac-h1">Who did what, and when.</h1>
      </header>
      <nav className="cn-chips ad-chips" aria-label="By kind">
        {groups.map((g) => {
          const on = (g.k === "all" && !group) || g.k === group;
          return <Link key={g.k} href={g.k === "all" ? `${who.base}/audit` : `${who.base}/audit?group=${g.k}`} aria-current={on ? "page" : undefined} className="cn-chip">{g.label}</Link>;
        })}
      </nav>
      {v.rows.length === 0 ? (
        <p className="bl-empty"><GRecord size={16} />Nothing here yet. Resends, route changes, invites and keys are written here as they happen.</p>
      ) : (
        <table className="bl-table ad-table">
          <thead><tr><th className="bl-num">#</th><th>When</th><th>Who</th><th>What</th><th>On</th><th>Details</th></tr></thead>
          <tbody>
            {v.rows.map((r, i) => {
              const s = said[r.action] ?? { word: r.action, G: GRecord, tone: "in" };
              return (
                <tr key={r.id}>
                  <td className="bl-num">{v.total - (v.page - 1) * 15 - i}</td>
                  <td className="cn-mono">{stamp(r.at, w)}</td>
                  <td className="cn-who">{r.who}{r.userId === null && <em>no longer in the team</em>}</td>
                  <td><span className={`ad-what cn-${s.tone}`}><s.G size={14} />{s.word}</span></td>
                  <td>{target(r)}</td>
                  <td className="ad-detail">{r.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Pager path={`${who.base}/audit`} page={v.page} total={v.total} query={{ group }} />
    </>
  );
}
