import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { Ago } from "@/ui/ago";
import { GCheck, GHold, GManifest, GPayIn } from "@/ui/glyphs";
import { day, time } from "@/ui/when";
import { CopyEmail as CopyText } from "../sheets/editor";
import { StripeLink, StripeUnlink } from "../stripe/editor";
import { stateWord } from "../states";

// Stripe payments in: the account's own Stripe, linked by a webhook's signing secret. Every paid checkout becomes a lead
// on the chosen route, like a form would. The page says where Stripe calls, what Fernway did with its last call, and the
// payments that became leads lately.
export async function StripeIn({ who }: { who: ConsoleWho }) {
  const [v, routes] = await Promise.all([who.data.stripe(), who.data.routes()]);
  // A payment books nothing, so routes with a meeting time are left out (as for embed forms and sheets).
  const usable = routes.filter((r) => !r.calendarId).map((r) => ({ key: r.key, label: r.label }));
  const w = who.when;
  const can = who.role !== "member";
  const l = v.link;
  const last = l?.lastResult ?? null;
  const lastBad = !!last && /^(paused|checkout \S+ refused)/.test(last);

  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GPayIn size={16} />Stripe payments</p>
          <h1 className="ac-h1">Every payment, a customer in GHL.</h1>
        </div>
        {can && v.onPlan && !l && <StripeLink address={v.address} current={null} routes={usable} />}
      </header>
      <p className="rt-lede">Link your own Stripe and each paid checkout travels into GHL like any lead: the contact found or made, moved to the route&apos;s stage and tags, with the amount as a note and a receipt.</p>

      {!v.onPlan && (
        <p className="cn-held"><GHold size={16} /><span>{l
          ? <>Paused: Stripe payments are on the Growth plan. Stripe keeps each payment and sends it again for up to three days; <Link href="/account/billing">move up in Plan and billing</Link> and they arrive.</>
          : <>Stripe payments are on the Growth plan. <Link href="/account/billing">Move up in Plan and billing</Link> to link your Stripe.</>}</span></p>
      )}

      {l ? (
        <section className="rt-card sh-card" aria-label="Your linked Stripe">
          <div className="rt-head">
            <span className={`bl-chip ${!v.onPlan || lastBad ? "bl-chip-hz" : "bl-chip-ok"}`}>{!v.onPlan || lastBad ? <GHold size={13} /> : <GCheck size={13} />}{!v.onPlan ? "Paused" : lastBad ? "Needs a look" : "Listening"}</span>
            <h2 className="rt-name"><GPayIn size={18} />Your Stripe</h2>
            {can && <span className="ef-do">{v.onPlan && <StripeLink address={v.address} current={l.routeKey} routes={usable} />}<StripeUnlink /></span>}
          </div>
          <p className="sh-in-p">Paid checkouts become leads on <Link href={`${who.base}/routes#route-${l.routeKey}`}><code>{l.routeKey}</code></Link>{l.routeLabel ? ` ${l.routeLabel}` : ""}.</p>
          <div className="si-addr"><span className="fm-label">Stripe calls</span><CopyText email={v.address} /></div>
          {last && <p className={lastBad ? "cn-held sh-err" : "si-last"}>{lastBad ? <GHold size={16} /> : <GCheck size={16} />}<span><b>Last call{l.lastAt ? <>, <Ago iso={l.lastAt} /></> : ""}:</b> {last}.</span></p>}
          <dl className="rt-facts">
            <div><dt>Payments in, 30 days</dt><dd className={v.leads30 ? "cn-ok" : ""}>{v.leads30.toLocaleString("en-US")}</dd></div>
            <div><dt>Last call</dt><dd>{l.lastAt ? <Ago iso={l.lastAt} /> : "Not yet"}</dd></div>
            <div><dt>Linked</dt><dd>{day(l.createdAt, w)}</dd></div>
            <div><dt>Linked by</dt><dd>{l.madeBy}</dd></div>
          </dl>
        </section>
      ) : v.onPlan && (
        <section className="rt-card sh-card sh-empty" aria-label="Stripe not linked">
          <h2 className="rt-name"><GPayIn size={18} />Stripe isn&apos;t linked yet</h2>
          <ol className="sh-steps">
            <li><span>In Stripe, open <b>Developers</b>, <b>Webhooks</b>, and add a destination for the events <code>checkout.session.completed</code> and <code>checkout.session.async_payment_succeeded</code>.</span></li>
            <li><span>Its endpoint URL is your Fernway address.</span><CopyText email={v.address} /></li>
            <li><span>{can ? <>Press <b>Link Stripe</b> and paste the destination&apos;s signing secret.</> : "The owner or an admin pastes the destination's signing secret here."}</span></li>
          </ol>
        </section>
      )}

      <section className="bl-sec" aria-labelledby="si-latest-h">
        <h2 id="si-latest-h" className="bl-h2"><GManifest size={18} />Payments that became leads</h2>
        {v.latest.length === 0 ? <p className="bl-empty"><GManifest size={16} />None in the last 30 days. Each paid checkout appears here the moment Fernway picks it up.</p> : (
          <table className="bl-table cn-moves">
            <thead><tr><th className="bl-num">#</th><th>Time</th><th>Waybill</th><th>Paid by</th><th>Payment</th><th>State</th></tr></thead>
            <tbody>
              {v.latest.map((r, i) => {
                const s = stateWord(r.state, r.tries);
                return (
                  <tr key={r.id}>
                    <td className="bl-num">{i + 1}</td>
                    <td className="cn-mono">{time(r.at, w)}</td>
                    <td><Link className="cn-wb" href={`${who.base}/lead/${r.id}`}>{r.waybill}</Link></td>
                    <td className="cn-who">{r.name}</td>
                    <td className="cn-mono">{r.message?.match(/^Paid (\S+ \S+)/)?.[1] ?? "-"}</td>
                    <td><span className={`bl-chip bl-chip-${s.tone}`}><s.G size={13} />{s.word}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="ls-p ls-small">Fernway reads only what Stripe sends about the checkout: the name, email, phone, business name and address the customer gave, and the amount. It never sees a card, and never calls your Stripe back. Stripe sending a payment again gives the same waybill.</p>
      </section>
    </>
  );
}
