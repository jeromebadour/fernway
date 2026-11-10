import type { Metadata } from "next";
import { failures } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/receipt.css";
import "@/ui/forms.css";
import "./break-it.css";
import { GClock, GScan, GShield } from "@/ui/glyphs";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { BreakIt } from "./break-it";

export const metadata: Metadata = { title: "Break it · Fernway" };

export default function BreakItPage() {
  return (
    <div className="wb">
      <SiteHeader current="/break-it" />
      <section className="wb-sec fm-page" aria-labelledby="bk-h">
        <div className="wb-sec-head">
          <p className="wb-eyebrow wb-eyebrow-re"><GScan size={16} />Live demo</p>
          <h1 id="bk-h" className="fm-h1">Break GHL. Watch the lead arrive anyway.</h1>
          <p className="wb-sec-lede">Make GoHighLevel misbehave the way it does in real life, send a lead into it, and watch Fernway hold it, retry it and deliver it, on a live receipt.</p>
        </div>
        <ul className="bk-facts">
          <li><GShield size={16} /><span><b>A stand-in GHL.</b> This runs Fernway&rsquo;s real delivery engine against a GHL inside Fernway, so nothing reaches a real account. The lead is invented: nothing about you is sent.</span></li>
          <li><GClock size={16} /><span><b>Sped up 10 times.</b> Fernway&rsquo;s 24-hour retry clock runs 10 times faster here: a 30-second wait takes 3 seconds. The receipt names the real waits.</span></li>
        </ul>
        <BreakIt failures={failures} />
      </section>
      <SiteFooter />
    </div>
  );
}
