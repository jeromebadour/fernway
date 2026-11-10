import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/forms.css";
import { GScan } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { FindWaybill } from "./find";

export const metadata: Metadata = { title: "Track a lead · Fernway" };

export default function Track() {
  return (
    <div className="wb">
      <SiteHeader current="/track" />
      <section className="wb-sec fm-page" aria-labelledby="find-h">
        <div className="tr-grid">
          <div className="wb-sec-head">
            <p className="wb-eyebrow"><GScan size={16} />Track a lead</p>
            <h1 id="find-h" className="fm-h1">Where is my lead?</h1>
            <p className="wb-sec-lede">Every lead sent through Fernway&rsquo;s forms has a waybill. Put in its number and the email you sent it with to open its receipt again, scan by scan, for 30 days.</p>
          </div>
          <FindWaybill />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
