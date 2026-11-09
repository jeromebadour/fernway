import Link from "next/link";
import "./landing.css";
import {
  GRoute, GScan, GManifest, GPrice, GDepot, GKey, GCheck, GResend, GHand, GFlow, GMark,
  GFunnel, GBlocks, GWidget, GPackage, GNodes, GLoop, GCard, GGrid, GMenu,
} from "@/ui/glyphs";

const scans = [
  { t: "09:41:02.12", g: <GScan size={14} />, what: "Picked up", where: "Trial form · fernway.app/start", tone: "in" },
  { t: "09:41:02.31", g: <GCheck size={14} />, what: "Checked", where: "Email and phone valid · no duplicate in GHL", tone: "ok" },
  { t: "09:41:02.90", g: <GHand size={14} />, what: "Handed to GHL", where: "Contact created · c_8XQ2LmP4", tone: "in" },
  { t: "09:41:03.44", g: <GManifest size={14} />, what: "Signed for", where: "Pipeline Sales · stage Trial · tags trial, dental", tone: "ok" },
  { t: "09:41:03.71", g: <GFlow size={14} />, what: "Workflow started", where: "Trial welcome · step 1 of 4", tone: "ok" },
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
  { Glyph: GGrid, name: "Google Sheets" },
];

export default function Landing() {
  return (
    <div className="wb">
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

      <header className="wb-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <nav className="wb-nav">
          <Link href="/#how"><GDepot size={16} />Product</Link>
          <Link href="/pricing"><GPrice size={16} />Pricing</Link>
          <Link href="/docs"><GManifest size={16} />Docs</Link>
          <Link href="/break-it"><GScan size={16} />Live demo</Link>
        </nav>
        <div className="wb-top-right">
          <Link className="wb-ghost" href="/sign-in"><GKey size={16} />Sign in</Link>
          <Link className="wb-go" href="/trial"><GRoute size={16} />Start a trial</Link>
        </div>
        <button className="wb-menu" type="button" aria-label="Menu"><GMenu size={20} /></button>
      </header>

      <main className="wb-main">
        <section className="wb-copy">
          <p className="wb-kicker"><span className="wb-dot" />Lead delivery for GoHighLevel</p>
          <h1>Every lead delivered.<em>Signed for in GHL.</em></h1>
          <p className="wb-lede">
            Fernway carries every form, booking and payment from your site into GoHighLevel, re-sends anything GHL
            refuses, and keeps the receipt. Nothing goes missing in the hand-off.
          </p>
          <div className="wb-ctas">
            <Link className="wb-go wb-go-lg" href="/trial"><GRoute />Start a 14-day trial</Link>
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
            <div className="wb-bill-head"><span className="wb-no">FW 24 00816</span></div>
            <div className="wb-stamp wb-stamp-re"><GResend size={15} />Returned 429 · re-sent 8 s</div>
          </article>

          <article className="wb-bill">
            <div className="wb-perf" aria-hidden="true" />
            <div className="wb-bill-head">
              <div>
                <p className="wb-label">Waybill <span className="wb-example">Example</span></p>
                <p className="wb-no">FW 24 00817</p>
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

            <div className="wb-stamp wb-stamp-ok"><GCheck size={16} />Delivered in 0.6 s</div>
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

      <div className="wb-thumb"><Link className="wb-go" href="/trial"><GRoute size={18} />Start a 14-day trial</Link></div>
    </div>
  );
}
