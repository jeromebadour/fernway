// The public site's shared frame: the top bar, the footer and the phone's pinned trial button (styles in site.css).
import Link from "next/link";
import { JEROME } from "./builder";
import { GDepot, GFind, GManifest, GMark, GMenu, GOut, GPrice, GRoute, GScan, GSignIn, GUser } from "./glyphs";

const nav = [
  { href: "/#how", label: "Product", G: GDepot },
  { href: "/pricing", label: "Pricing", G: GPrice },
  { href: "/docs", label: "Docs", G: GManifest },
  { href: "/break-it", label: "Live demo", G: GScan },
  { href: "/track", label: "Track a lead", G: GFind },
];

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="wb-top">
      <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
      <nav className="wb-nav">
        {nav.map(({ href, label, G }) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}><G size={16} />{label}</Link>
        ))}
      </nav>
      <div className="wb-top-right">
        <Link className="wb-ghost" href="/sign-in"><GSignIn size={16} />Sign in</Link>
        <Link className="wb-go" href="/trial"><GRoute size={16} />Start a trial</Link>
      </div>
      <button className="wb-menu" type="button" aria-label="Menu"><GMenu size={20} /></button>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="wb-foot">
      <div className="wb-foot-top">
        <div className="wb-foot-brand">
          <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
          <p>Lead delivery for GoHighLevel. Every lead delivered, and the receipt to prove it.</p>
        </div>
        <nav className="wb-foot-cols" aria-label="Footer">
          <div><p>Product</p><Link href="/#how">How a lead travels</Link><Link href="/delivery">How delivery works</Link><Link href="/demo">Book a demo</Link><Link href="/track">Track a lead</Link><Link href="/pricing">Pricing</Link><Link href="/break-it">Live demo</Link><Link href="/status">Status</Link></div>
          <div><p>Developers</p><Link href="/docs">Docs</Link><Link href="/docs/api">API</Link></div>
          <div><p>Fernway</p><Link href="/contact">Contact sales</Link><Link href="/about">About</Link><Link href="/changelog">Changelog</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
        </nav>
      </div>
      <div className="wb-foot-bottom">
        <span>Fernway is a portfolio product. © 2026</span>
        <a href={JEROME.site} className="wb-by">
          <GUser size={14} />Built by <b>{JEROME.name}</b><GOut size={13} />
        </a>
      </div>
    </footer>
  );
}

export function Thumb() {
  return <div className="wb-thumb"><Link className="wb-go" href="/trial"><GRoute size={18} />Start a 14-day trial</Link></div>;
}
