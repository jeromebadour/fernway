import type { Metadata } from "next";
import Link from "next/link";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { inviteFor } from "@fernway/delivery";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { delivery } from "@/lib/connect";
import { GHold, GSignIn, GSignUp } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { JoinForm } from "./form";

export const metadata: Metadata = { title: "Join a team · Fernway", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// An invite link: who invited you, to which account and as what; then a name and a password, and you're in.
export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  accountsOrNotFound();
  const { token } = await params;
  const i = await inviteFor(delivery().db, token);
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="jn-h">
        <div className="au-end">
          {i ? (
            <>
              <p className="wb-eyebrow"><GSignUp size={16} />Join a team</p>
              <h1 id="jn-h" className="fm-h1">Join {i.accountName} on Fernway.</h1>
              <p className="wb-sec-lede">{i.by ? `${i.by} invited` : "You were invited"} <b>{i.email}</b> as {i.role === "admin" ? "an admin" : "a member"}. Choose your name and a password.</p>
              <div className="au-wrap au-wrap-in"><JoinForm token={token} /></div>
            </>
          ) : (
            <>
              <p className="wb-eyebrow"><GHold size={16} />Join a team</p>
              <h1 id="jn-h" className="fm-h1">This invite no longer works.</h1>
              <p className="wb-sec-lede">It was used, cancelled, or its 7 days ran out. Ask whoever invited you to send a new one.</p>
              <p className="au-other">Already joined? <Link href="/sign-in"><GSignIn size={15} />Sign in</Link></p>
            </>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
