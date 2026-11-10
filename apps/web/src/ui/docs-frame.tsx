// The docs' frame: the site's header and footer, a rail of pages and this page's sections, and the page itself.
import Link from "next/link";
import type { ReactNode } from "react";
import "./site.css";
import "./forms.css";
import "./docs.css";
import { GBrackets, GDown, GJump, GManifest, GPlay } from "./glyphs";
import { SiteFooter, SiteHeader } from "./site";

const pages = [
  { href: "/docs", label: "Quick start", G: GPlay },
  { href: "/docs/api", label: "API reference", G: GBrackets },
];

export function DocsFrame({ current, sections, children }: { current: string; sections: { id: string; label: string }[]; children: ReactNode }) {
  return (
    <div className="wb">
      <SiteHeader current="/docs" />
      <div className="dc">
        <nav className="dc-rail" aria-label="Docs">
          <p className="wb-label"><GManifest size={14} />Docs</p>
          <ul>
            {pages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} aria-current={p.href === current ? "page" : undefined}><p.G size={15} />{p.label}</Link>
                {p.href === current && (
                  <ul>{sections.map((s) => <li key={s.id}><a href={`#${s.id}`}><GJump size={13} />{s.label}</a></li>)}</ul>
                )}
              </li>
            ))}
          </ul>
          <a className="dc-spec" href="/api/v1/openapi.json"><GDown size={14} />OpenAPI 3.1 file</a>
        </nav>
        <main className="dc-main">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
