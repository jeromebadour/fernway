import type { Metadata } from "next";
import Link from "next/link";
import "@/ui/site.css";
import "./pricing.css";
import { GCard, GCheck, GHold, GManifest, GPrice, GResend, GRoute, GScan } from "@/ui/glyphs";
import { perLead, rates } from "@/ui/rates";
import { SiteFooter, SiteHeader, signedIn, Thumb } from "@/ui/site";
import { LostLeadCalculator } from "./calculator";

export const metadata: Metadata = { title: "Pricing · Fernway" };

// What counts toward a plan, exactly as billing must count it (plan step 5 builds it this way).
const counting = [
  { G: GCheck, tone: "ok", what: "Signed for in GHL", rule: "Counts once.", how: "The contact is in GHL and the opportunity in its stage." },
  { G: GResend, tone: "re", what: "Re-sent, then signed for", rule: "Counts once.", how: "However many tries it took." },
  { G: GScan, tone: "in", what: "Sent twice by your site", rule: "Counts once.", how: "The same idempotency key keeps one waybill." },
  { G: GHold, tone: "hz", what: "Held or returned", rule: "Never counts.", how: "Until a resend gets it signed for." },
  { G: GRoute, tone: "go", what: "Over your plan", rule: "Still delivered.", how: "Nothing is cut off mid-month; we ask you to move up for the next one." },
];

export default async function Pricing() {
  const me = await signedIn();
  return (
    <div className="wb">
      <SiteHeader current="/pricing" />

      <section className="wb-sec pr-head" aria-labelledby="pr-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GPrice size={16} />Rates</p>
          <h1 id="pr-h" className="pr-h1">Pay for the leads that reach GHL.</h1>
          <p className="wb-sec-lede">One price a month, set by how many leads are signed for in GHL. Every plan has every delivery promise: 8 tries over 24 hours, receipts for every hand-off, and one-press resend.</p>
        </div>

        <div className="wb-rates pr-rates">
          {rates.map(({ plan, price, leads, note, team, has, ...r }) => (
            <article key={plan} className={"pick" in r ? "wb-rate wb-rate-pick" : "wb-rate"}>
              <p className="wb-rate-plan">{plan}{"pick" in r && <span>Most sites</span>}</p>
              <p className="wb-rate-price"><b>${price}</b>a month</p>
              <dl>
                <div><dt>Leads signed for</dt><dd>{leads.toLocaleString("en-US")}<em>a month</em></dd></div>
                <div><dt>Per lead</dt><dd>{perLead(price, leads)}</dd></div>
              </dl>
              <p className="wb-rate-note">{note}</p>
              <ul className="pr-has">
                {has.map((h) => <li key={h}><GCheck size={14} />{h}</li>)}
                <li><GCheck size={14} />Team: {team}</li>
              </ul>
              {/* Signed in, a plan is chosen where it is paid for: the account's billing page. */}
              {me ? (
                <Link className={"pick" in r ? "wb-go pr-cta" : "wb-ghost pr-cta"} href="/account/billing">
                  <GCard size={16} />Choose {plan} in billing
                </Link>
              ) : (
                <Link className={"pick" in r ? "wb-go pr-cta" : "wb-ghost pr-cta"} href={`/trial?plan=${plan.toLowerCase()}`}>
                  <GRoute size={16} />Try {plan} free for 14 days
                </Link>
              )}
            </article>
          ))}
        </div>
        <p className="pr-small">Prices in US dollars, before any tax. Cancel any month. The trial needs no card.</p>
      </section>

      <section className="wb-sec wb-sec-alt" aria-labelledby="count-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GManifest size={16} />How leads are counted</p>
          <h2 id="count-h">Only a signed waybill counts.</h2>
          <p className="wb-sec-lede">Your bill is read from the same scans you see in the console, so every lead charged has its receipt.</p>
        </div>
        <ul className="pr-count">
          {counting.map(({ G, tone, what, rule, how }) => (
            <li key={what} className={`tone-${tone}`}>
              <span className="pr-count-g"><G size={18} /></span>
              <span className="pr-count-what">{what}</span>
              <span className="pr-count-rule">{rule}</span>
              <span className="pr-count-how">{how}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="wb-sec" aria-labelledby="calc-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow wb-eyebrow-hz"><GHold size={16} />What a lost lead costs you</p>
          <h2 id="calc-h">Count what the hand-off loses now.</h2>
          <p className="wb-sec-lede">A form that fails quietly, a GHL limit hit at a busy hour, an expired connection nobody noticed. Put in your own numbers and see what that is worth a month.</p>
        </div>
        <LostLeadCalculator />
      </section>

      <SiteFooter />
      <Thumb />
    </div>
  );
}
