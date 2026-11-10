import type { Metadata } from "next";
import Link from "next/link";
import "@/ui/site.css";
import "@/ui/forms.css";
import "./delivery.css";
import data from "@/ui/delivery-proofs.json";
import { GHand, GJump, GManifest, GMark, GProof, GScan, GShield } from "@/ui/glyphs";
import { RetryClock } from "@/ui/retry-clock";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = {
  title: "How delivery works · Fernway",
  description: "What Fernway does when GoHighLevel is busy, down, refuses a lead, or a token runs out, and the tests that prove it.",
};

// Each case: what GHL (or the world) does, what Fernway does, and the tests that prove it. The tests are named word for
// word with their line; packages/delivery/test/proofs.test.ts fails the build if a name or a line stops matching.
// (GitHub's code view ignores text fragments, so the link names the line: Kami 2026-11-10 17:39.)
const REPO = "https://github.com/jeromebadour/fernway";
const testLink = (file: string, line: number) => `${REPO}/blob/main/${file}#L${line}`;
const base = (file: string) => file.split("/").pop()!;

export default function Delivery() {
  return (
    <div className="wb">
      <SiteHeader current="/delivery" />
      <section className="wb-sec dv" aria-labelledby="dv-h">
        <header className="dv-head">
          <p className="wb-eyebrow"><GShield size={16} />How delivery works</p>
          <h1 id="dv-h" className="fm-h1">What happens when GHL says no.</h1>
          <p className="wb-sec-lede">GoHighLevel gets busy, goes down, refuses data and expires tokens. None of that may cost a lead. Here is what Fernway does in each case, and the test that proves it, run on every change before it ships.</p>
          <nav className="dv-jump" aria-label="Cases">
            {data.cases.map((c, i) => <a key={c.id} href={`#${c.id}`}><GJump size={13} /><b>{String(i + 1).padStart(2, "0")}</b>{c.title}</a>)}
          </nav>
        </header>

        {data.cases.map((c, i) => (
          <article key={c.id} id={c.id} className="dv-case" aria-labelledby={`${c.id}-h`}>
            <div className="dv-side">
              <span className="dv-no">{String(i + 1).padStart(2, "0")}</span>
              <h2 id={`${c.id}-h`}>{c.title}</h2>
            </div>
            <div className="dv-body">
              <div className="dv-row dv-ghl"><p className="wb-label"><GHand size={14} />{c.id === "crash" ? "What goes wrong" : "GHL"}</p><p>{c.ghl}</p></div>
              <div className="dv-row dv-fw"><p className="wb-label"><span className="dv-mark"><GMark size={14} /></span>Fernway</p><p>{c.fernway}</p></div>
              {"clock" in c && c.clock && <RetryClock />}
              <div className="dv-proofs">
                <p className="wb-label"><GProof size={14} />Proven by</p>
                <ol>
                  {c.proofs.map((p) => (
                    <li key={p.name}>
                      <a href={testLink(p.file, p.line)} target="_blank" rel="noopener">
                        <GProof size={15} /><code>{base(p.file)}:{p.line}</code><span>{p.name}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </article>
        ))}

        <div className="dv-end">
          <p>Every test above runs against a real database and queue, with a fake GHL that fails on demand, on <a href={`${REPO}/actions`} target="_blank" rel="noopener"><GProof size={15} />every push</a>. Nothing deploys unless they pass.</p>
          <div className="dv-do">
            <Link className="wb-go" href="/break-it"><GScan size={16} />Break it yourself</Link>
            <Link className="wb-ghost" href="/docs"><GManifest size={16} />Docs</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
