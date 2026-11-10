import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { GLock } from "@/ui/glyphs";
import { AskReset } from "@/ui/reset-forms";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Reset your password · Fernway" };
export const dynamic = "force-dynamic";

export default function Reset() {
  accountsOrNotFound();
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="rs-h">
        <div className="au-end">
          <p className="wb-eyebrow"><GLock size={16} />Reset your password</p>
          <h1 id="rs-h" className="fm-h1">A new password, by email.</h1>
          <div className="au-wrap au-wrap-in"><AskReset /></div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
