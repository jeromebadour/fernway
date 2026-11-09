import Link from "next/link";
import "./not-found.css";
import { GMark, GRoute } from "@/ui/glyphs";

export default function NotFound() {
  return (
    <main className="nf">
      <Link className="nf-brand" href="/"><GMark size={26} /><span>FERNWAY</span></Link>
      <section className="nf-bill">
        <p className="nf-label">Waybill</p>
        <p className="nf-no">FW ·· ·····</p>
        <h1>No waybill at this address.</h1>
        <p className="nf-text">This page doesn&apos;t exist, or it hasn&apos;t been built yet.</p>
        <Link className="nf-go" href="/"><GRoute size={16} />Back to the start</Link>
        <div className="nf-stamp">Not found · 404</div>
      </section>
    </main>
  );
}
