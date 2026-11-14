import type { Metadata } from "next";
import Link from "next/link";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { AuthForm } from "@/ui/auth";
import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { GCheck, GFlow, GKey, GRoute, GSignIn, GSignUp } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Start a trial · Fernway" };

// Beside the form: the new account's first waybill, still a draft. Its three steps are the first run's real steps
// (connect GHL, pick a route, send a test lead), so the visitor sees where signing up leads.
const firstRun = [
  { G: GKey, what: "Connect GoHighLevel", detail: "approve Fernway in GHL, no key to paste" },
  { G: GFlow, what: "Pick the route", detail: "the pipeline, stage and tags your leads land in" },
  { G: GRoute, what: "Send a test lead", detail: "and watch its waybill fill in, live" },
];

export const dynamic = "force-dynamic";

export default async function SignUp() {
  accountsOrNotFound();
  if (await currentPerson()) redirect("/account");
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="up-h">
        <div className="fm-grid">
          <div>
            <p className="wb-eyebrow"><GSignUp size={16} />Start a trial</p>
            <h1 id="up-h" className="fm-h1">Your own account, 14 days free.</h1>
            <p className="wb-sec-lede">Connect your GoHighLevel, send your site&rsquo;s leads through Fernway, and see every one signed for.</p>
            <div className="au-wrap"><AuthForm mode="up" /></div>
            <p className="au-other">Already have an account? <Link href="/sign-in"><GSignIn size={15} />Sign in</Link></p>
          </div>
          <article className="wb-bill au-draft" aria-label="Your first waybill">
            <div className="wb-perf" aria-hidden="true" />
            <div className="wb-bill-head">
              <div><p className="wb-label">Waybill <span className="au-draft-tag">Draft</span></p><p className="wb-no">FW 26 00001</p></div>
              <div className="wb-stamp au-stamp"><GSignUp size={15} />Your first</div>
            </div>
            <div className="wb-route">
              <div><p className="wb-label">From</p><p>Your website<span>a form, the embed form, WordPress or the API</span></p></div>
              <GRoute size={22} />
              <div><p className="wb-label">To</p><p>Your GoHighLevel<span>the pipeline you choose</span></p></div>
            </div>
            <ol className="wb-scans fm-ghost-scans">
              {firstRun.map(({ G, what, detail }, i) => (
                <li key={what} className="tone-in">
                  <span className="wb-t">step {i + 1}</span>
                  <span className="wb-node"><G size={14} /></span>
                  <span className="wb-what">{what}<span>{detail}</span></span>
                </li>
              ))}
              <li className="tone-ok">
                <span className="wb-t">then</span>
                <span className="wb-node"><GCheck size={14} /></span>
                <span className="wb-what">Every lead signed for<span>8 tries over 24 h, a receipt for each</span></span>
              </li>
            </ol>
          </article>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
