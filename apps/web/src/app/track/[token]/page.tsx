import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readTrackToken, shipmentAccount, trackView } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/receipt.css";
import "@/ui/forms.css";
import { GRoute, GScan } from "@/ui/glyphs";
import { delivery } from "@/lib/connect";
import { demoAccount } from "@/lib/intake";
import { Receipt } from "@/ui/receipt";
import { SiteFooter, SiteHeader } from "@/ui/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your waybill · Fernway", robots: { index: false, follow: false } };

// The receipt a visitor keeps: only the signed link opens it, for 30 days.
export default async function Track({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { db, cfg } = delivery();
  const id = readTrackToken(cfg.key, token);
  const view = id === null ? null : await trackView(db, id);
  if (!view) notFound();
  // Demo-account leads (Break it, the docs' public key) only ever meet the stand-in GHL; the receipt says so.
  const standIn = (await shipmentAccount(db, id!)) === demoAccount();
  return (
    <div className="wb">
      <SiteHeader />
      <section className="wb-sec fm-page" aria-labelledby="track-h">
        <div className="fm-grid">
          <div className="wb-sec-head">
            <p className="wb-eyebrow"><GScan size={16} />Tracking receipt</p>
            <h1 id="track-h" className="fm-h1">Waybill {view.number}</h1>
            <p className="wb-sec-lede">Every scan your lead got on its way into GoHighLevel, with what GHL answered. This page is yours for 30 days; only this link opens it.</p>
            <Link className="wb-link" href="/#how"><GRoute size={16} />How a lead travels</Link>
          </div>
          <Receipt initial={view} token={token} {...(standIn ? { to: "Stand-in GHL" } : {})} />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
