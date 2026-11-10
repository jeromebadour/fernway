import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/receipt.css";
import "@/ui/forms.css";
import { GRoute } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { TrialForm } from "./form";

export const metadata: Metadata = { title: "Start a trial · Fernway" };

export default function Trial() {
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="trial-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GRoute size={16} />Start a 14-day trial</p>
          <h1 id="trial-h" className="fm-h1">Send us your first lead.</h1>
          <p className="wb-sec-lede">This form is a Fernway form. Send it and watch your own lead travel into GoHighLevel, scan by scan, the way every lead you send through Fernway will.</p>
        </div>
        <TrialForm />
      </section>
      <SiteFooter />
    </div>
  );
}
