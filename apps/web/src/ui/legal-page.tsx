// The plain pages (Privacy, Terms) in Fernway's own form: a manifest of numbered sections, each clause numbered like
// a line on a waybill (2.3), with "In short" first and the version on its own docket.
import Link from "next/link";
import { Fragment } from "react";
import { GManifest } from "./glyphs";
import type { LegalDoc } from "./legal";
import { SiteFooter, SiteHeader } from "./site";

/** **bold** and [label](href) inside a clause. */
function Text({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const bold = p.match(/^\*\*(.+)\*\*$/);
        if (bold) return <b key={i}>{bold[1]}</b>;
        const link = p.match(/^\[(.+)\]\((.+)\)$/);
        if (link) {
          const [, label, href] = link;
          return href!.startsWith("/") ? <Link key={i} href={href!}>{label}</Link> : <a key={i} href={href}>{label}</a>;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function LegalPage({ doc, current }: { doc: LegalDoc; current: string }) {
  return (
    <div className="wb">
      <SiteHeader current={current} />
      <section className="wb-sec lg" aria-labelledby="lg-h">
        <div className="lg-head">
          <p className="wb-eyebrow"><GManifest size={16} />{doc.title === "Privacy Policy" ? "Privacy" : "Terms"}</p>
          <h1 id="lg-h" className="fm-h1">{doc.title}</h1>
          <p className="wb-sec-lede">{doc.intro}</p>
          <dl className="lg-docket">
            <div><dt>Version</dt><dd>{doc.version}</dd></div>
            <div><dt>In force from</dt><dd>{doc.effective}</dd></div>
          </dl>
        </div>
        <div className="lg-grid">
          <nav className="lg-toc" aria-label="On this page">
            <p className="wb-label">On this page</p>
            <ol>
              {doc.sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`}><span>{i + 1}</span>{s.title}</a></li>)}
            </ol>
          </nav>
          <div className="lg-body">
            <aside className="lg-short" aria-label="In short">
              <p className="wb-label">In short</p>
              <ul>{doc.short.map((s) => <li key={s}>{s}</li>)}</ul>
            </aside>
            {doc.sections.map((s, i) => (
              <section key={s.id} id={s.id} className="lg-sec">
                <h2><span>{i + 1}</span>{s.title}</h2>
                {s.clauses.map((c, j) => (
                  <p key={j} className="lg-clause"><span className="lg-no">{i + 1}.{j + 1}</span><span><Text text={c} /></span></p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
