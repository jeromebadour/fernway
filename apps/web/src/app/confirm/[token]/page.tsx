import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmEmail } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { delivery } from "@/lib/connect";
import { currentPerson } from "@/lib/session";
import { GHold, GMail, GSignIn } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Confirm your email · Fernway", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The link from the confirm email: it works once, for 48 hours. A good link lands on the account (or sign in) with a
// notice; a spent one says so here, with the way to a new one.
export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  accountsOrNotFound();
  const ok = await confirmEmail(delivery().db, (await params).token);
  const me = await currentPerson();
  if (ok) redirect(me ? "/account?done=confirmed" : "/sign-in?done=confirmed");
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="cf-h">
        <div className="au-end">
          <p className="wb-eyebrow au-end-hz"><GHold size={16} />Confirm your email</p>
          <h1 id="cf-h" className="fm-h1">This link has done its job.</h1>
          <p className="wb-sec-lede">It was used already, or it is over 48 hours old. {me?.emailConfirmed ? "Your email is confirmed." : "A fresh one is one press away."}</p>
          <div className="au-end-do">
            {me ? <Link className="wb-go" href="/account"><GMail size={16} />{me.emailConfirmed ? "Your account" : "Send a new link"}</Link>
              : <Link className="wb-go" href="/sign-in?next=/account"><GSignIn size={16} />Sign in</Link>}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
