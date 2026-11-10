import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/receipt.css";
import "@/ui/forms.css";
import { GHand } from "@/ui/glyphs";
import { LeadForm, type LeadFormSpec } from "@/ui/lead-form";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const metadata: Metadata = { title: "Contact sales · Fernway" };

const spec: LeadFormSpec = {
  form: "contact",
  fields: ["firstName", "lastName", "email", "phone", ["companyName", { required: false }], "message"],
  from: "Fernway’s contact sales form",
  route: "Contact sales",
  send: "Send it and track it",
};

export default function Contact() {
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="contact-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow"><GHand size={16} />Contact sales</p>
          <h1 id="contact-h" className="fm-h1">Ask us anything about your leads.</h1>
          <p className="wb-sec-lede">Your question travels the way every lead does: into GoHighLevel as a contact, with your message on it as a note. Watch it go.</p>
        </div>
        <LeadForm spec={spec} />
      </section>
      <SiteFooter />
    </div>
  );
}
