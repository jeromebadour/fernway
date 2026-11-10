import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/receipt.css";
import "@/ui/forms.css";
import { GClock } from "@/ui/glyphs";
import { LeadForm, type LeadFormSpec } from "@/ui/lead-form";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Book a demo · Fernway" };

const spec: LeadFormSpec = {
  form: "demo",
  booking: true,
  fields: ["firstName", "lastName", "email", "companyName"],
  from: "Fernway’s demo form",
  route: "Demo",
  send: "Book it and track it",
};

export default function Demo() {
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="demo-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GClock size={16} />Book a demo</p>
          <h1 id="demo-h" className="fm-h1">Pick a time. Watch it land in GHL.</h1>
          <p className="wb-sec-lede">These are the real free times in Fernway&rsquo;s GoHighLevel calendar. Book one and your meeting travels like a lead: into GHL as a contact, onto the calendar, and into the pipeline as Booked.</p>
        </div>
        <LeadForm spec={spec} />
      </section>
      <SiteFooter />
    </div>
  );
}
