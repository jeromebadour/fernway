import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { GLock } from "@/ui/glyphs";
import { NewPassword } from "@/ui/reset-forms";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Set a new password · Fernway", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SetPassword({ params }: { params: Promise<{ token: string }> }) {
  accountsOrNotFound();
  const { token } = await params;
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="np-h">
        <div className="au-end">
          <p className="wb-eyebrow"><GLock size={16} />Set a new password</p>
          <h1 id="np-h" className="fm-h1">Choose a new password.</h1>
          <div className="au-wrap au-wrap-in"><NewPassword token={token} /></div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
