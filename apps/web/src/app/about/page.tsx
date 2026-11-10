import type { Metadata } from "next";
import Link from "next/link";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/legal.css";
import "./about.css";
import { GCheck, GHand, GHold, GManifest, GRoute } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "About · Fernway" };

// What is real, what is only a demo, and who built it. Every line must stay true: check it when the code changes.
const real = [
  "A GoHighLevel account, connected the way a Marketplace app connects: OAuth, with tokens that refresh themselves.",
  "Every lead sent from this site: it really travels into that account, and its receipt shows each step as it happens.",
  "The delivery promise: 8 tries over 24 hours, one contact per person, and a receipt for every hand-off.",
  "Nightly backups, copied off the server encrypted, with a restore test every week.",
  "Public code, with its tests run on every change before anything is deployed.",
];
const notReal = [
  "There are no customers. The plans and prices describe how Fernway would be sold; no one can buy it.",
  "The GoHighLevel account is a developer sandbox, not a business's CRM.",
  "Start a trial and Book a demo show the delivery working; they don't open an account or commit anyone to a meeting.",
];
const built = ["TypeScript", "Next.js", "Node.js", "PostgreSQL", "Drizzle", "Redis and BullMQ", "GoHighLevel API v2", "OAuth 2.0", "Docker", "GitHub Actions"];

export default function About() {
  return (
    <div className="wb">
      <SiteHeader current="/about" />
      <section className="wb-sec lg ab" aria-labelledby="ab-h">
        <div className="lg-head">
          <p className="wb-eyebrow"><GManifest size={16} />About</p>
          <h1 id="ab-h" className="fm-h1">Fernway is a portfolio product.</h1>
          <p className="wb-sec-lede">It was built to show, end to end, how a website&rsquo;s leads get into GoHighLevel without one going missing. The product is invented. The engineering is not.</p>
        </div>

        <div className="ab-grid">
          <div className="ab-col">
            <h2><GCheck size={18} />What is real</h2>
            <ul className="ab-list ab-real">{real.map((r) => <li key={r}><GCheck size={15} /><span>{r}</span></li>)}</ul>
            <h2 className="ab-h-hz"><GHold size={18} />What is only a demo</h2>
            <ul className="ab-list ab-demo">{notReal.map((r) => <li key={r}><GHold size={15} /><span>{r}</span></li>)}</ul>
          </div>

          <aside className="ab-by">
            <p className="wb-label">Built and run by</p>
            <div className="wb-consignee ab-who">
              <span className="wb-ava">JB</span>
              <div>
                <p className="wb-name">Jerome Badour <span className="wb-role">Developer</span></p>
                <p className="wb-org">Independent, full-stack: web apps, APIs, servers and integrations</p>
              </div>
            </div>
            <p className="ab-text">Fernway is one of the projects on <a href="https://jeromebadour.com">jeromebadour.com</a>. Its code is public on <a href="https://github.com/jeromebadour/fernway">GitHub</a>, with the tests that prove each promise on this site.</p>
            <p className="wb-label ab-label">Built with</p>
            <ul className="ab-chips">{built.map((b) => <li key={b}>{b}</li>)}</ul>
            <div className="ab-do">
              <Link className="wb-go" href="/trial"><GRoute size={16} />Send it a lead</Link>
              <Link className="wb-ghost" href="/contact"><GHand size={16} />Contact sales</Link>
            </div>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
