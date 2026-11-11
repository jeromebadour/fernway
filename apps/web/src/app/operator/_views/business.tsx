// The operator's business views: every account (found by name, owner email or AC number), one account in full with
// its actions, Stripe's events and money (test mode), and the alert emails. Real console and public demo alike.
import Link from "next/link";
import type { AccountDetail, AccountRow, emailView, stripeView } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import {
  GBuilding, GCard, GCheck, GClock, GFind, GHold, GJump, GLock, GMail, GManifest, GNodes, GResend, GRoute, GUser,
} from "@/ui/glyphs";
import { Pager } from "@/ui/pager";
import { day, stamp, time, type When } from "@/ui/when";
import { OpsAction } from "./action";

const ac = (id: number) => `AC ${String(id).padStart(6, "0")}`;
const fmt = (v: number) => v.toLocaleString("en-US");
const money = (cents: number, cur = "usd") => `${cur === "usd" ? "$" : ""}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}${cur === "usd" ? "" : ` ${cur.toUpperCase()}`}`;
const future = (iso: string | null) => !!iso && Date.parse(iso) > Date.now();
const planWord: Record<string, string> = { starter: "Starter", growth: "Growth", scale: "Scale" };
const billingWord: Record<string, string> = { active: "paid up", past_due: "past due", unpaid: "unpaid", canceled: "ended", trialing: "Stripe trial", incomplete: "first payment pending", incomplete_expired: "first payment failed", paused: "paused" };

export function planChip(plan: string | null, billing: string | null, trialEndsAt: string | null) {
  if (plan) {
    const bad = billing === "past_due" || billing === "unpaid";
    const off = billing === "canceled" || billing === "incomplete_expired";
    return <span className={`bl-chip ${bad ? "bl-chip-hz" : off ? "bl-chip-stop" : "bl-chip-ok"}`}><GCard size={13} />{planWord[plan] ?? plan}{bad ? ", past due" : off ? ", ended" : ""}</span>;
  }
  if (future(trialEndsAt)) return <span className="bl-chip bl-chip-in"><GClock size={13} />Trial</span>;
  return <span className="bl-chip bl-chip-stop"><GHold size={13} />Trial over</span>;
}

export function AccountsView({ v, w, base }: { v: { q: string; total: number; page: number; rows: AccountRow[] }; w: When; base: string }) {
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GBuilding size={16} />Accounts</p>
        <h1 className="ac-h1">{fmt(v.total)} {v.q ? (v.total === 1 ? "account matches." : "accounts match.") : (v.total === 1 ? "account." : "accounts.")}</h1>
      </header>
      <form className="op-find" action={`${base}/accounts`}>
        <span className="fm-input fm-has-g cn-search">
          <span className="fm-g" aria-hidden="true"><GFind size={16} /></span>
          <input name="q" defaultValue={v.q} placeholder="A name, an owner's email, AC 000012" maxLength={120} aria-label="Find an account" />
        </span>
        <button type="submit" className="wb-ghost fm-btn"><GFind size={16} />Find</button>
      </form>
      {v.rows.length === 0 ? <p className="bl-empty"><GFind size={16} />{v.q ? <>No account matches <b>{v.q}</b>.</> : "No accounts yet."}</p> : (
        <table className="bl-table op-table op-accounts">
          <thead><tr><th>Account</th><th>Owner</th><th>Plan</th><th>Leads, 30 d</th><th>GHL</th><th>Since</th></tr></thead>
          <tbody>{v.rows.map((a) => (
            <tr key={a.id}>
              <td><Link className="op-acc" href={`${base}/accounts/${a.id}`}>{a.name}<em>{ac(a.id)}</em></Link></td>
              <td className="cn-who">{a.owner ?? <span className="tm-off">No owner</span>}{a.ownerEmail && <em>{a.ownerEmail}</em>}</td>
              <td>{planChip(a.plan, a.billing, a.trialEndsAt)}<em className="op-people"><GUser size={12} />{a.people} {a.people === 1 ? "person" : "people"}</em></td>
              <td className="cn-mono">{fmt(a.leads30)}{a.held ? <em className="op-hz op-block">{a.held} held</em> : null}</td>
              <td>{a.ghl === "connected" ? <span className="bl-chip bl-chip-ok"><GNodes size={13} />Good</span> : a.ghl ? <span className="bl-chip bl-chip-hz"><GHold size={13} />Reconnect</span> : <span className="tm-off">Not connected</span>}</td>
              <td className="cn-mono">{day(a.createdAt, w)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Pager path={`${base}/accounts`} page={v.page} total={v.total} query={{ q: v.q || undefined }} />
    </>
  );
}

const auditWords: Record<string, string> = {
  "lead.resent": "resent a lead", "leads.resent": "resent held leads", "route.made": "made a route", "route.changed": "changed a route",
  "ghl.connected": "connected GHL", "ghl.disconnected": "disconnected GHL", "member.invited": "invited someone", "member.joined": "joined",
  "member.role": "changed a role", "member.removed": "removed someone", "invite.cancelled": "cancelled an invite", "key.made": "made an API key",
  "key.revoked": "revoked an API key", "plan.changed": "changed the plan",
};

export function AccountView({ a, w, base, can, demo }: { a: AccountDetail; w: When; base: string; can: boolean; demo?: boolean }) {
  const onTrial = !a.plan;
  return (
    <>
      <p className="cn-back"><Link href={`${base}/accounts`}><GJump size={14} />Accounts</Link></p>
      <div className="cn-lead-head">
        <div>
          <p className="wb-eyebrow"><GBuilding size={16} />{ac(a.id)}</p>
          <h1 className="ac-h1">{a.name}</h1>
          <p className="cn-lead-sub">Since {day(a.createdAt, w)} · {a.people.length} {a.people.length === 1 ? "person" : "people"} · {a.routes} {a.routes === 1 ? "route" : "routes"}</p>
        </div>
        <div className="cn-lead-do">
          {planChip(a.plan, a.billing, a.trialEndsAt)}
          {can && onTrial && <OpsAction demo={demo} glyph="calendar" label="Extend the trial" title={`Give ${a.name} 7 more days?`} path="/api/operator/accounts/trial" body={{ accountId: a.id }}
            text={<>Their trial {future(a.trialEndsAt) ? <>ends {day(a.trialEndsAt!, w)}</> : "is over"}; it then ends 7 days later. Nothing is charged.</>} />}
          {can && a.stripeSubscription && <OpsAction demo={demo} glyph="resend" label="Sync with Stripe" title={`Read ${a.name}'s plan again from Stripe?`} path="/api/operator/accounts/sync" body={{ accountId: a.id }}
            text={<>Fernway asks Stripe for subscription <code>{a.stripeSubscription}</code> as it stands now and copies it over, as a webhook would. For an event that never arrived.</>} />}
        </div>
      </div>

      <dl className="op-nums op-acc-nums">
        <div><dt>Leads, 30 days</dt><dd>{fmt(a.leads.d30)}</dd></div>
        <div><dt>Signed for, ever</dt><dd className="cn-ok">{fmt(a.leads.signed)}</dd></div>
        <div><dt>Held</dt><dd className={a.leads.held ? "cn-hz" : ""}>{fmt(a.leads.held)}</dd></div>
        <div><dt>Returned</dt><dd className={a.leads.returned ? "cn-hz" : ""}>{fmt(a.leads.returned)}</dd></div>
        <div><dt>Moving</dt><dd>{fmt(a.leads.moving)}</dd></div>
        <div><dt>Last lead</dt><dd>{a.leads.lastAt ? <Ago iso={a.leads.lastAt} /> : "None yet"}</dd></div>
      </dl>

      <div className="cn-two">
        <section aria-labelledby="op-p-h">
          <h2 id="op-p-h" className="bl-h2"><GUser size={18} />People</h2>
          <ul className="op-list">{a.people.map((p) => (
            <li key={p.userId}>
              <span className="wb-ava tm-ava">{p.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span><b>{p.name}<i className={`op-role op-role-${p.role}`}>{p.role}</i></b><em>{p.email}{p.confirmed ? "" : ", not confirmed"}</em></span>
              <span className="op-right">{p.twoStep ? <span className="bl-chip bl-chip-ok"><GLock size={12} />Two-step</span> : null}<em>{p.lastSeenAt ? <>seen <Ago iso={p.lastSeenAt} /></> : "never signed in"}</em></span>
            </li>
          ))}</ul>
        </section>
        <section aria-labelledby="op-b-h">
          <h2 id="op-b-h" className="bl-h2"><GCard size={18} />Plan and billing</h2>
          <dl className="op-kv">
            <div><dt>Plan</dt><dd>{a.plan ? `${planWord[a.plan] ?? a.plan}, ${a.billing ? billingWord[a.billing] ?? a.billing : "no status"}` : a.trialEndsAt ? `Trial to ${day(a.trialEndsAt, w)}` : "No plan"}</dd></div>
            {a.periodEnd && <div><dt>{a.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt><dd>{day(a.periodEnd, w)}</dd></div>}
            <div><dt>Stripe customer</dt><dd className="cn-mono">{a.stripeCustomer ?? "None"}</dd></div>
          </dl>
          {a.invoices.length > 0 && (
            <ul className="op-inv">{a.invoices.map((i) => (
              <li key={i.id}><span className="cn-mono">{i.number ?? i.id.slice(0, 14)}</span><span>{day(i.createdAt, w)}</span><b>{money(i.cents, i.currency)}</b>
                <span className={`bl-chip ${i.status === "paid" ? "bl-chip-ok" : i.status === "open" ? "bl-chip-hz" : "bl-chip-stop"}`}>{i.status}</span></li>
            ))}</ul>
          )}
        </section>
      </div>

      <div className="cn-two">
        <section aria-labelledby="op-gh-h">
          <h2 id="op-gh-h" className="bl-h2"><GNodes size={18} />GHL</h2>
          {a.ghl ? (
            <dl className="op-kv">
              <div><dt>Sub-account</dt><dd className="cn-mono">{a.ghl.location}</dd></div>
              <div><dt>Token</dt><dd>{a.ghl.status === "connected" ? <span className="bl-chip bl-chip-ok"><GCheck size={13} />Good</span> : <span className="bl-chip bl-chip-hz"><GHold size={13} />Reconnect</span>}</dd></div>
              <div><dt>Connected</dt><dd>{day(a.ghl.connectedAt, w)}</dd></div>
              {a.ghl.error && <div><dt>GHL said</dt><dd className="cn-reason">{a.ghl.error}</dd></div>}
            </dl>
          ) : <p className="bl-empty"><GNodes size={16} />Not connected: their leads are held until it is.</p>}
        </section>
        <section aria-labelledby="op-ev-h">
          <h2 id="op-ev-h" className="bl-h2"><GManifest size={18} />Latest in their audit log</h2>
          {a.recent.length === 0 ? <p className="bl-empty"><GManifest size={16} />Nothing yet.</p> : (
            <ul className="op-list op-feed">{a.recent.map((r, i) => (
              <li key={i}><GRoute size={14} /><span><b>{r.who}</b> {auditWords[r.action] ?? r.action}{r.target ? <> <code>{r.target}</code></> : null}</span><em className="cn-mono">{stamp(r.at, w)}</em></li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}

type Stripe = Awaited<ReturnType<typeof stripeView>>;
export function StripeView({ v, w, base }: { v: Stripe; w: When; base: string }) {
  const count = (pred: (p: Stripe["plans"][number]) => boolean) => v.plans.filter(pred).reduce((s, p) => s + p.n, 0);
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GCard size={16} />Stripe</p>
        <h1 className="ac-h1">Plans and payments, test mode.</h1>
      </header>
      <dl className="op-nums">
        <div><dt>Paid, 30 days</dt><dd className="cn-ok">{money(v.paid30Cents)}</dd></div>
        <div><dt>Open invoices</dt><dd className={v.openCents ? "cn-hz" : ""}>{money(v.openCents)}</dd></div>
        <div><dt>Starter</dt><dd>{count((p) => p.plan === "starter" && p.billing === "active")}</dd></div>
        <div><dt>Growth</dt><dd>{count((p) => p.plan === "growth" && p.billing === "active")}</dd></div>
        <div><dt>Scale</dt><dd>{count((p) => p.plan === "scale" && p.billing === "active")}</dd></div>
        <div><dt>Past due</dt><dd className={count((p) => p.billing === "past_due" || p.billing === "unpaid") ? "cn-hz" : ""}>{count((p) => p.billing === "past_due" || p.billing === "unpaid")}</dd></div>
      </dl>
      <section className="bl-sec" aria-labelledby="op-se-h">
        <h2 id="op-se-h" className="bl-h2"><GManifest size={18} />Events Fernway acted on</h2>
        {v.rows.length === 0 ? <p className="bl-empty"><GCard size={16} />No events from Stripe yet.</p> : (
          <table className="bl-table op-table">
            <thead><tr><th className="bl-num">#</th><th>Received</th><th>Event</th><th>Account</th><th>Id</th></tr></thead>
            <tbody>{v.rows.map((e, i) => (
              <tr key={e.id}>
                <td className="bl-num">{v.total - (v.page - 1) * 15 - i}</td>
                <td className="cn-mono">{stamp(e.at, w)}</td>
                <td><span className={`op-ev op-ev-${e.type.split(".")[0]}`}>{e.type}</span></td>
                <td>{e.accountId ? <Link className="op-acc" href={`${base}/accounts/${e.accountId}`}>{e.account}</Link> : <span className="tm-off">None</span>}</td>
                <td className="cn-mono op-id">{e.id}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pager path={`${base}/stripe`} page={v.page} total={v.total} />
      </section>
    </>
  );
}

type Email = Awaited<ReturnType<typeof emailView>>;
const alertWords: Record<string, string> = { held: "A lead held", returned: "A lead returned", weekly: "Monday's summary" };
export function EmailView({ v, w }: { v: Email; w: When }) {
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GMail size={16} />Email</p>
        <h1 className="ac-h1">{v.gaveUp7 ? `${v.gaveUp7} ${v.gaveUp7 === 1 ? "email" : "emails"} given up this week.` : "Every alert went out."}</h1>
      </header>
      <dl className="op-nums">
        <div><dt>Alerts sent, 7 d</dt><dd className="cn-ok">{fmt(v.sent7)}</dd></div>
        <div><dt>Waiting to send</dt><dd>{fmt(v.waiting)}</dd></div>
        <div><dt>Given up, 7 d</dt><dd className={v.gaveUp7 ? "cn-hz" : ""}>{fmt(v.gaveUp7)}</dd></div>
        <div><dt>Held · returned · weekly</dt><dd>{v.held7} · {v.returned7} · {v.weekly7}</dd></div>
        <div><dt>Confirm links, 7 d</dt><dd>{fmt(v.confirm7)}</dd></div>
        <div><dt>Reset links, 7 d</dt><dd>{fmt(v.reset7)}</dd></div>
      </dl>
      <section className="bl-sec" aria-labelledby="op-em-h">
        <h2 id="op-em-h" className="bl-h2"><GMail size={18} />Latest alerts</h2>
        {v.recent.length === 0 ? <p className="bl-empty"><GMail size={16} />No alert emails yet.</p> : (
          <table className="bl-table op-table op-mail">
            <thead><tr><th>Made</th><th>Alert</th><th>To</th><th>State</th></tr></thead>
            <tbody>{v.recent.map((e) => (
              <tr key={e.id}>
                <td className="cn-mono">{stamp(e.createdAt, w)}</td>
                <td>{alertWords[e.kind] ?? e.kind}</td>
                <td className="cn-who">{e.email}{e.account && <em>{e.account}</em>}</td>
                <td>{e.sentAt ? <span className="bl-chip bl-chip-ok"><GCheck size={13} />Sent{e.tries > 1 ? ` on try ${e.tries}` : ""}</span>
                  : e.gaveUpAt ? <><span className="bl-chip bl-chip-stop"><GHold size={13} />Given up</span>{e.error && <em className="cn-reason">{e.error}</em>}</>
                  : <><span className="bl-chip bl-chip-re"><GResend size={13} />Try {e.tries + 1} at {time(e.nextAt, w)}</span>{e.error && <em className="cn-reason">{e.error}</em>}</>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
