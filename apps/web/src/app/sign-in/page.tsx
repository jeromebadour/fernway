import type { Metadata } from "next";
import Link from "next/link";
import { statusView } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { delivery } from "@/lib/connect";
import { checkHealth } from "@/lib/health";
import { demoAccount } from "@/lib/intake";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { AuthForm } from "@/ui/auth";
import { GCheck, GClock, GHold, GScan, GSignIn, GSignUp } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Sign in · Fernway" };
export const dynamic = "force-dynamic";

// Beside the form: Fernway right now, read live from the same numbers as /status. Nothing about any account is shown
// before signing in.
export default async function SignIn() {
  accountsOrNotFound();
  const [health, view] = await Promise.all([checkHealth(), statusView(delivery().db, demoAccount()).catch(() => null)]);
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="in-h">
        <div className="fm-grid au-in-grid">
          <div>
            <p className="wb-eyebrow"><GSignIn size={16} />Sign in</p>
            <h1 id="in-h" className="fm-h1">Back to your depot.</h1>
            <div className="au-wrap au-wrap-in"><AuthForm mode="in" /></div>
            <p className="au-other">New to Fernway? <Link href="/sign-up"><GSignUp size={15} />Start a 14-day trial</Link></p>
          </div>
          <aside className="au-now" aria-labelledby="now-h">
            <p className="wb-label" id="now-h"><GScan size={14} />Fernway right now</p>
            <p className={`au-now-head ${health.ok ? "au-ok" : "au-hz"}`}>{health.ok ? <><GCheck size={18} />Every part is running</> : <><GHold size={18} />Something is down</>}</p>
            {view && (
              <dl className="au-now-grid">
                <div><dt>Signed for</dt><dd>{view.queue.signed24h}</dd><dd className="au-sub">last 24 hours</dd></div>
                <div><dt>Moving now</dt><dd>{view.queue.moving}</dd><dd className="au-sub">on their way to GHL</dd></div>
                {view.ghl?.medianMs != null && <div><dt>GHL answers in</dt><dd>{view.ghl.medianMs}<em>ms</em></dd><dd className="au-sub">typical, last 24 hours</dd></div>}
              </dl>
            )}
            <Link className="wb-link" href="/status"><GClock size={16} />The full status</Link>
          </aside>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
