import type { Metadata } from "next";
import Link from "next/link";
import { billingView, PLANS, planKeys, trackToken, type BillingView, type PlanKey } from "@fernway/delivery";
import { billingOn } from "@/lib/billing";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { GCard, GCheck, GClock, GDown, GHold, GManifest, GOut, GRoute, GScan } from "@/ui/glyphs";
import { perLead, rates } from "@/ui/rates";
import { AwaitPlan, OpenPortal, StartPlan } from "./actions";

export const metadata: Metadata = { title: "Plan and billing · Fernway" };
export const dynamic = "force-dynamic";

type Tone = "in" | "ok" | "hz" | "stop";
// What the plan's state means, in a word, a line and a colour (the same tones as a waybill's scans).
function standing(v: BillingView, day: (iso: string) => string): { word: string; line: string; tone: Tone } {
  if (v.plan && v.status === "past_due") return { word: "Payment failed", line: "Stripe tries the card again over the next days. Leads keep going through.", tone: "stop" };
  if (v.plan && v.status === "unpaid") return { word: "Unpaid", line: "Stripe stopped trying the card. Update it to keep the plan.", tone: "stop" };
  if (v.plan && v.endsAtPeriodEnd && v.periodEnd) return { word: `Ends ${day(v.periodEnd)}`, line: "Cancelled. The plan runs to the end of the month already paid.", tone: "hz" };
  if (v.plan && v.periodEnd) return { word: `Renews ${day(v.periodEnd)}`, line: `$${PLANS[v.plan].cents / 100} on that day, from the card in Stripe.`, tone: "ok" };
  if (v.status === "canceled") return { word: "Ended", line: "The plan has ended. Start one below to carry on.", tone: "hz" };
  if (v.trialEndsAt) {
    const left = Math.max(0, Math.ceil((Date.parse(v.trialEndsAt) - Date.now()) / 86_400_000));
    return left > 0
      ? { word: `${left} ${left === 1 ? "day" : "days"} left`, line: `The trial ends ${day(v.trialEndsAt)}. No card is needed until you pick a plan.`, tone: "in" }
      : { word: "Trial ended", line: "Pick a plan below to keep delivering leads.", tone: "hz" };
  }
  return { word: "No plan", line: "Pick a plan below.", tone: "in" };
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

const invoiceState = (i: BillingView["invoices"][number]): { word: string; tone: Tone; G: typeof GCheck } =>
  i.status === "paid" ? { word: "Paid", tone: "ok", G: GCheck }
    : i.failed ? { word: "Payment failed", tone: "stop", G: GHold }
      : i.status === "open" ? { word: "Due", tone: "in", G: GClock }
        : { word: i.status === "void" ? "Void" : i.status === "uncollectible" ? "Written off" : "Draft", tone: "hz", G: GHold };

// Plan and billing: the plan and where it stands, the leads it has carried this period, the three plans, the move to
// Customer that the first payment made in Fernway's own GHL (with its receipt), and the invoices.
export default async function Billing({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const m = await requirePerson("/account/billing");
  const { paid } = await searchParams;
  const { db, cfg } = delivery();
  const v = (await billingView(db, m.accountId))!;
  const owner = m.role === "owner";
  const live = billingOn();
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: m.timeZone });
  const dayY = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: m.timeZone });
  const st = standing(v, day);
  const plan = v.plan ? PLANS[v.plan] : null;
  const limit = plan?.leads ?? null;
  const fits = rates.find((r) => v.used <= r.leads) ?? rates[rates.length - 1]!;
  const share = limit ? Math.min(1, v.used / limit) : 0;
  const over = limit !== null && v.used > limit;
  const paying = v.plan !== null && v.status !== "canceled";

  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GCard size={16} />Plan and billing</p>
        <h1 className="ac-h1">Your plan, its leads and its invoices.</h1>
      </header>

      {paid && !paying && live && <AwaitPlan />}

      <section className={`bl-plan bl-${st.tone}`} aria-label="Your plan">
        <div className="bl-plan-main">
          <p className="bl-plan-label">Plan</p>
          <p className="bl-plan-name">{plan ? plan.name : v.trialEndsAt ? "Trial" : "None"}</p>
          <p className={`bl-chip bl-chip-${st.tone}`}>{st.tone === "stop" ? <GHold size={13} /> : st.tone === "ok" ? <GCheck size={13} /> : <GClock size={13} />}{st.word}</p>
          <p className="bl-plan-line">{st.line}</p>
        </div>
        <dl className="bl-facts">
          <div><dt>Price</dt><dd>{plan ? <>${plan.cents / 100}<em>a month</em></> : "$0"}</dd></div>
          <div><dt>{plan ? "This month" : "Trial"}</dt><dd>{v.periodStart && v.periodEnd ? `${day(v.periodStart)} to ${day(v.periodEnd)}` : v.trialEndsAt ? `${day(v.usedFrom)} to ${day(v.trialEndsAt)}` : "None"}</dd></div>
          <div><dt>Account</dt><dd>AC {String(m.accountId).padStart(6, "0")}</dd></div>
        </dl>
        {owner && live && v.hasCustomer && <div className="bl-plan-do"><OpenPortal ghost={!(v.status === "past_due" || v.status === "unpaid")} label={v.status === "past_due" || v.status === "unpaid" ? "Update the card" : "Card, plan and invoices"} /></div>}
      </section>

      <section className="bl-use" aria-labelledby="bl-use-h">
        <div className="bl-use-head">
          <h2 id="bl-use-h"><GScan size={18} />Leads signed for {plan ? "this month" : "in the trial"}</h2>
          <p className="bl-use-n"><b>{v.used.toLocaleString("en-US")}</b>{limit !== null && <em>of {limit.toLocaleString("en-US")}</em>}</p>
        </div>
        {limit !== null ? (
          <div className={over ? "bl-meter bl-meter-over" : "bl-meter"} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={v.used} aria-label="Leads signed for">
            <i style={{ width: `${(share * 100).toFixed(2)}%` }} />
            {[0.25, 0.5, 0.75].map((t) => <span key={t} style={{ left: `${t * 100}%` }} />)}
          </div>
        ) : null}
        <p className="bl-use-note">
          {over
            ? <><GHold size={14} />Past the plan. Every lead is still delivered; next month needs {rates.find((r) => v.used <= r.leads)?.plan ?? "Scale"}.</>
            : limit === null
              ? <><GManifest size={14} />{fits.plan} covers this: up to {fits.leads.toLocaleString("en-US")} a month. Held and returned leads never count.</>
              : <><GManifest size={14} />Each lead counts once, when GHL signs for it. Held and returned leads never count.</>}
        </p>
      </section>

      <section className="bl-sec" aria-labelledby="bl-plans-h">
        <h2 id="bl-plans-h" className="bl-h2"><GRoute size={18} />Plans</h2>
        <div className="wb-rates bl-rates">
          {planKeys.map((k: PlanKey) => {
            const r = rates.find((x) => x.plan === PLANS[k].name)!;
            const mine = paying && v.plan === k;
            const pick = !paying && r.plan === fits.plan;
            return (
              <article key={k} className={mine || pick ? "wb-rate wb-rate-pick" : "wb-rate"}>
                <p className="wb-rate-plan">{r.plan}{mine ? <span><GCheck size={12} />Your plan</span> : pick ? <span>Fits your leads</span> : null}</p>
                <p className="wb-rate-price"><b>${r.price}</b>a month</p>
                <dl>
                  <div><dt>Leads signed for</dt><dd>{r.leads.toLocaleString("en-US")}<em>a month</em></dd></div>
                  <div><dt>Per lead</dt><dd>{perLead(r.price, r.leads)}</dd></div>
                </dl>
                <p className="wb-rate-note">{r.note} · Team: {r.team}</p>
                {owner && live && !mine && (paying ? <OpenPortal ghost label={`Switch to ${r.plan}`} /> : <StartPlan plan={k} name={r.plan} pick={pick} />)}
              </article>
            );
          })}
        </div>
        <p className="bl-small">US dollars, before any tax. Paid through Stripe; Fernway never sees the card. A switch is charged or credited for the days left.</p>
      </section>

      {v.customerMove && (
        <section className="bl-sec" aria-labelledby="bl-move-h">
          <h2 id="bl-move-h" className="bl-h2"><GManifest size={18} />Your move to Customer</h2>
          <Link className="bl-move" href={`/track/${trackToken(cfg.key, v.customerMove.shipmentId)}`}>
            <span className="bl-move-wb">{v.customerMove.waybill}</span>
            <span className="bl-move-what">The first payment sent you to Customer in Fernway&apos;s own GHL, as a lead like any other.</span>
            <span className={`bl-chip bl-chip-${v.customerMove.state === "signed" ? "ok" : v.customerMove.state === "held" || v.customerMove.state === "returned" ? "hz" : "in"}`}>
              {v.customerMove.state === "signed" ? <><GCheck size={13} />Signed for</> : v.customerMove.state === "held" ? <><GHold size={13} />Held</> : v.customerMove.state === "returned" ? <><GHold size={13} />Returned</> : <><GClock size={13} />In transit</>}
            </span>
            <span className="bl-move-go"><GOut size={14} />Receipt</span>
          </Link>
        </section>
      )}

      <section className="bl-sec" aria-labelledby="bl-inv-h">
        <h2 id="bl-inv-h" className="bl-h2"><GManifest size={18} />Invoices</h2>
        {v.invoices.length === 0 ? (
          <p className="bl-empty"><GManifest size={16} />No invoices yet. The first one comes with the first payment.</p>
        ) : (
          <table className="bl-table">
            <thead><tr><th className="bl-num">#</th><th>Invoice</th><th>Date</th><th>For</th><th>Amount</th><th>State</th><th><span className="bl-sr">Open</span></th></tr></thead>
            <tbody>
              {v.invoices.map((i, n) => {
                const s = invoiceState(i);
                return (
                  <tr key={i.id}>
                    <td className="bl-num">{v.invoices.length - n}</td>
                    <td className="bl-inv-no">{i.number ?? "Draft"}</td>
                    <td>{dayY(i.at)}</td>
                    <td>{i.plan ? PLANS[i.plan].name : "Plan"}{i.periodStart && i.periodEnd ? <em>{day(i.periodStart)} to {day(i.periodEnd)}</em> : null}</td>
                    <td className="bl-amt">{money(i.cents, i.currency)}</td>
                    <td><span className={`bl-chip bl-chip-${s.tone}`}><s.G size={13} />{s.word}</span></td>
                    <td className="bl-links">
                      {i.hostedUrl && <a href={i.hostedUrl} target="_blank" rel="noreferrer"><GOut size={14} />View</a>}
                      {i.pdfUrl && <a href={i.pdfUrl} target="_blank" rel="noreferrer"><GDown size={14} />PDF</a>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
