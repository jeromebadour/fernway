import Link from "next/link";
import "@/ui/site.css";
import { BuilderCard, JEROME } from "@/ui/builder";
import { RetryClock } from "@/ui/retry-clock";
import { SiteFooter, SiteHeader, signedIn, Thumb } from "@/ui/site";
import { perLead, rates } from "@/ui/rates";
import {
  GRoute, GScan, GManifest, GPrice, GKey, GCheck, GResend, GHand,
  GFunnel, GBlocks, GWidget, GPackage, GNodes, GLoop, GCard, GSheet, GHold, GShield, GOut, GGrid,
} from "@/ui/glyphs";

const scans = [
  { t: "09:41:02.12", g: <GScan size={14} />, what: "Picked up", where: "Trial form · fernway.app/start", tone: "in" },
  { t: "09:41:02.31", g: <GCheck size={14} />, what: "Checked", where: "Email and phone valid · no duplicate in GHL", tone: "ok" },
  { t: "09:41:02.90", g: <GHand size={14} />, what: "Handed to GHL", where: "Contact created · c_8XQ2LmP4", tone: "in" },
  { t: "09:41:03.44", g: <GManifest size={14} />, what: "Signed for", where: "Pipeline Sales · stage Trial · tags trial, dental", tone: "ok" },
];

// The four stations every lead passes, exactly as the delivery engine records them (packages/delivery).
const stations = [
  {
    G: GScan, name: "Picked up", tone: "in", scan: "picked_up · from api",
    text: "Your form, booking or API call hands the lead over and it gets its waybill number at once. Sent twice, it keeps one number.",
  },
  {
    G: GCheck, name: "Checked", tone: "ok", scan: "checked · valid: email, phone",
    text: "Email and phone are checked at the door, phones cleaned to international form. A lead GHL could never match is refused here, with the reason.",
  },
  {
    G: GHand, name: "Handed to GHL", tone: "in", scan: "handed · GHL 201 · contact",
    text: "The contact is sent as an upsert: GHL matches it by email, then phone, so a returning lead updates its contact instead of making a second.",
  },
  {
    G: GManifest, name: "Signed for", tone: "ok", scan: "signed · GHL 201 · stage set",
    text: "The opportunity lands in the stage your route names, with its tags. What was sent and what GHL answered are kept side by side.",
  },
];

// What Fernway does with each answer GHL can give (packages/delivery/src/ghl.ts, sortAnswer).
const answers = [
  { code: "429 · 408 · 5xx", what: "Too busy, timed out, or down", does: "Re-sent on the clock below, up to 8 tries over 24\u00a0h", tone: "re", G: GResend },
  { code: "No answer", what: "The request never came back", does: "Re-sent the same way; a try already in flight is never doubled", tone: "re", G: GResend },
  { code: "401", what: "The GHL token expired", does: "Token refreshed once, then re-sent at once", tone: "in", G: GKey },
  { code: "Other 4xx", what: "GHL refused the data itself", does: "Held with GHL's own reason; fix it and resend in one press", tone: "hz", G: GHold },
  { code: "Disconnected", what: "GHL was unplugged from Fernway", does: "Held as \"needs reconnecting\"; every lead waits, none is lost", tone: "hz", G: GHold },
];

// The tools Fernway really connects to, each with its own Fernway glyph (never their logos).
const worksWith = [
  { Glyph: GFunnel, name: "GoHighLevel" },
  { Glyph: GBlocks, name: "WordPress" },
  { Glyph: GWidget, name: "Elementor" },
  { Glyph: GPackage, name: "Laravel" },
  { Glyph: GNodes, name: "n8n" },
  { Glyph: GLoop, name: "Make" },
  { Glyph: GCard, name: "Stripe" },
  { Glyph: GSheet, name: "Google Sheets" },
];

export default async function Landing() {
  const me = await signedIn();
  return (
    <div className="wb">
      <div className="wb-first">
      <svg className="wb-floor" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="lamp" cx="18%" cy="0%" r="70%">
            <stop offset="0" stopColor="#5cc8b8" stopOpacity="0.22" />
            <stop offset="0.5" stopColor="#5cc8b8" stopOpacity="0.05" />
            <stop offset="1" stopColor="#5cc8b8" stopOpacity="0" />
          </radialGradient>
          <pattern id="bays" width="240" height="240" patternUnits="userSpaceOnUse">
            <path d="M0 0H240M0 0V240" stroke="#c8d7e8" strokeOpacity="0.035" strokeWidth="1" />
            <path d="M0 120H240" stroke="#c8d7e8" strokeOpacity="0.02" strokeDasharray="6 10" />
          </pattern>
        </defs>
        <rect width="1440" height="900" fill="url(#bays)" />
        <g stroke="#7aa8e0" strokeOpacity="0.09" strokeWidth="1.5" fill="none">
          <path d="M-20 700 C 300 640, 420 520, 700 520 S 1100 380, 1480 300" />
          <path d="M-20 780 C 260 760, 520 640, 820 640 S 1200 560, 1480 520" strokeDasharray="2 8" />
          <path d="M200 920 C 260 700, 340 600, 520 560" />
        </g>
        <g fill="#c8d7e8" fillOpacity="0.05" fontFamily="Archivo Narrow" fontWeight="700" fontSize="64" letterSpacing="4">
          <text x="1220" y="880">BAY 04</text>
          <text x="24" y="880">BAY 03</text>
        </g>
        <rect width="1440" height="900" fill="url(#lamp)" />
      </svg>

      <SiteHeader />

      <main className="wb-main">
        <section className="wb-copy">
          <p className="wb-kicker"><span className="wb-dot" />Lead delivery for GoHighLevel</p>
          <h1>Every lead delivered.<em>Signed for in GHL.</em></h1>
          <p className="wb-lede">
            Fernway carries every form, booking and payment from your site into GoHighLevel, re-sends anything GHL
            refuses, and keeps the receipt. Nothing goes missing in the hand-off.
          </p>
          <div className="wb-ctas">
            {me
              ? <Link className="wb-go wb-go-lg" href="/console"><GGrid />Open your console</Link>
              : <Link className="wb-go wb-go-lg" href="/trial"><GRoute />Start a 14-day trial</Link>}
            <Link className="wb-ghost wb-ghost-lg" href="/break-it"><GScan />Track a lead in the demo</Link>
          </div>
          <dl className="wb-manifest">
            <div><dt>Retries</dt><dd className="re">8<em>tries over 24 h</em></dd></div>
            <div><dt>Duplicates</dt><dd className="ok">0<em>matched by email and phone</em></dd></div>
            <div><dt>Receipts</dt><dd>Every<em>hand-off logged</em></dd></div>
          </dl>
        </section>

        <section className="wb-stack" aria-label="A delivered lead">
          <article className="wb-bill wb-bill-back">
            <div className="wb-bill-head"><span className="wb-no">FW 26 00816</span></div>
            <div className="wb-stamp wb-stamp-re"><GResend size={15} />GHL 429 · re-sent at 30 s</div>
          </article>

          <article className="wb-bill">
            <div className="wb-perf" aria-hidden="true" />
            <div className="wb-bill-head">
              <div>
                <p className="wb-label">Waybill <span className="wb-example">Example</span></p>
                <p className="wb-no">FW 26 00817</p>
              </div>
              <svg className="wb-barcode" viewBox="0 0 120 34" aria-hidden="true">
                {[2,1,3,1,1,2,1,3,2,1,1,2,3,1,2,1,1,3,1,2,2,1,3,1,1,2,1,1,3,2].map((w, i, a) => {
                  const x = a.slice(0, i).reduce((s, v) => s + v + 1.6, 0);
                  return <rect key={i} x={x} y="0" width={w} height="34" fill="currentColor" />;
                })}
              </svg>
            </div>

            <div className="wb-route">
              <div><p className="wb-label">From</p><p>Website<span>Trial form</span></p></div>
              <GRoute size={22} />
              <div><p className="wb-label">To</p><p>GoHighLevel<span>Sales · Trial</span></p></div>
            </div>

            <div className="wb-consignee">
              <span className="wb-ava">LH</span>
              <div>
                <p className="wb-name">Lena Hartmann <span className="wb-role">Owner</span></p>
                <p className="wb-org">Northpine Dental · Portland, OR · 4 chairs</p>
              </div>
            </div>

            <ol className="wb-scans">
              {scans.map((s) => (
                <li key={s.t} className={`tone-${s.tone}`}>
                  <span className="wb-t">{s.t}</span>
                  <span className="wb-node">{s.g}</span>
                  <span className="wb-what">{s.what}<span>{s.where}</span></span>
                </li>
              ))}
            </ol>

            <div className="wb-stamp wb-stamp-ok"><GCheck size={16} />Signed for in 1.3 s</div>
          </article>
        </section>
      </main>

      <footer className="wb-ticker" aria-label="Works with">
        <span className="wb-ticker-tag"><GRoute size={16} />Works with</span>
        <ul className="wb-works">
          {worksWith.map(({ Glyph, name }) => (
            <li key={name}><Glyph size={16} />{name}</li>
          ))}
        </ul>
      </footer>
      </div>

      <section className="wb-sec" id="how" aria-labelledby="how-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GRoute size={16} />How a lead travels</p>
          <h2 id="how-h">Four scans, from your form to a stage in GHL.</h2>
          <p className="wb-sec-lede">Every lead carries a waybill. Each station adds a scan to it, and a scan is never changed or deleted afterwards.</p>
        </div>
        <ol className="wb-line">
          {stations.map(({ G, name, tone, scan, text }, i) => (
            <li key={name} className={`tone-${tone}`}>
              <div className="wb-stop">
                <span className="wb-stop-no">0{i + 1}</span>
                <span className="wb-stop-node"><G size={18} /></span>
              </div>
              <h3>{name}</h3>
              <p>{text}</p>
              <code>{scan}</code>
            </li>
          ))}
        </ol>
        <p className="wb-proof">
          <GCheck size={16} />
          <span>The first real lead, <b>FW 26 00001</b>, went from pickup to signed for in <b>1.6 s</b> on its first try,
          into Fernway&rsquo;s GHL sandbox on 10 November 2026.</span>
        </p>
      </section>

      <section className="wb-sec wb-sec-alt" aria-labelledby="no-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow wb-eyebrow-re"><GResend size={16} />When GHL says no</p>
          <h2 id="no-h">A refused lead is re-sent or held. It is never dropped.</h2>
          <p className="wb-sec-lede">GHL limits how fast you may write, its tokens expire every day, and sometimes it is simply down. Fernway reads every answer and does one of three things.</p>
        </div>
        <div className="wb-no-grid">
          <table className="wb-answers">
            <thead><tr><th>GHL answers</th><th>Meaning</th><th>Fernway</th></tr></thead>
            <tbody>
              {answers.map(({ code, what, does, tone, G }) => (
                <tr key={code} className={`tone-${tone}`}>
                  <td><span className="wb-code">{code}</span></td>
                  <td>{what}</td>
                  <td><span className="wb-does"><G size={15} />{does}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <RetryClock>
            <p>Early tries come fast, because most refusals are a busy minute. Later ones spread out, in case GHL is down for hours. After the eighth, the waybill is <b className="hz">returned</b> with every answer kept, and one press sends it again.</p>
            <Link className="wb-link" href="/delivery"><GShield size={16} />How delivery works, case by case</Link>
          </RetryClock>
        </div>
      </section>

      <section className="wb-sec" id="pricing" aria-labelledby="rates-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GPrice size={16} />Rates</p>
          <h2 id="rates-h">Priced by leads signed for in GHL.</h2>
          <p className="wb-sec-lede">Held and returned leads never count. No seats, no setup fee, 14 days free.</p>
        </div>
        <div className="wb-rates">
          {rates.map(({ plan, price, leads, note, ...r }) => (
            <article key={plan} className={"pick" in r ? "wb-rate wb-rate-pick" : "wb-rate"}>
              <p className="wb-rate-plan">{plan}{"pick" in r && <span>Most sites</span>}</p>
              <p className="wb-rate-price"><b>${price}</b>a month</p>
              <dl>
                <div><dt>Leads signed for</dt><dd>{leads.toLocaleString("en-US")}<em>a month</em></dd></div>
                <div><dt>Per lead</dt><dd>{perLead(price, leads)}</dd></div>
              </dl>
              <p className="wb-rate-note">{note}</p>
            </article>
          ))}
        </div>
        <div className="wb-rates-foot">
          {me
            ? <Link className="wb-go" href="/account/billing"><GCard size={16} />Your plan and billing</Link>
            : <Link className="wb-go" href="/trial"><GRoute size={16} />Start a 14-day trial</Link>}
          <Link className="wb-link" href="/pricing"><GPrice size={16} />Every rate, and what a lost lead costs you</Link>
        </div>
      </section>

      <section className="wb-sec wb-sec-alt wb-maker" aria-labelledby="maker-h">
        <div className="wb-maker-grid">
          <div>
            <p className="wb-eyebrow"><GManifest size={16} />Who built it</p>
            <h2 id="maker-h">One developer, end to end.</h2>
            <p className="wb-sec-lede">Fernway is a portfolio product by Jerome Badour: the delivery engine, the GoHighLevel connection, the server it runs on and every page. Its code is public, with the tests that prove each promise.</p>
            <div className="wb-maker-do">
              <a className="wb-go" href={JEROME.site}><GOut size={16} />Jerome&rsquo;s work</a>
              <a className="wb-ghost" href={`${JEROME.github}/fernway`}><GOut size={16} />The code on GitHub</a>
            </div>
          </div>
          <div className="wb-maker-card"><p className="wb-label">Built and run by</p><BuilderCard large /></div>
        </div>
      </section>

      <SiteFooter />

      <Thumb />
    </div>
  );
}
