import type { Metadata } from "next";
import { deploys } from "@fernway/delivery";
import "@/ui/site.css";
import "@/ui/forms.css";
import "./changelog.css";
import history from "@/ui/changelog.json";
import { delivery } from "@/lib/connect";
import { BuilderCard, JEROME } from "@/ui/builder";
import { GManifest, GOut } from "@/ui/glyphs";
import { PAGE_SIZE, Pager, pageOf } from "@/ui/pager";
import { SiteFooter, SiteHeader } from "@/ui/site";
import { ChangelogList, type Entry } from "./list";

export const metadata: Metadata = { title: "Changelog · Fernway", description: "Every change to Fernway, from its real commits, and when each went live." };
export const dynamic = "force-dynamic";

// The entries are the real commits (apps/web/scripts/changelog.mjs, at build time); the deploys are the ones the deploy
// script recorded (ops_runs). Nothing here is written by hand.
type Commit = { hash: string; at: string; title: string; notes: string[] };

export default async function Changelog({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const commits = history as Commit[];
  const page = pageOf((await searchParams).page, commits.length);
  const shipped = await deploys(delivery().db).catch(() => []);
  const live = process.env.APP_COMMIT ?? "";
  const firstRecorded = shipped.at(-1)?.at ?? null;
  const entries: Entry[] = commits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c, i) => {
    const mine = shipped.filter((d) => c.hash.startsWith(d.commit));
    return { ...c, n: (page - 1) * PAGE_SIZE + i + 1, deployedAt: mine.at(-1)?.at ?? null, live: live.length >= 7 && c.hash.startsWith(live) };
  });
  const older = firstRecorded !== null && commits.some((c) => c.at < firstRecorded);

  return (
    <div className="wb">
      <SiteHeader current="/changelog" />
      <section className="wb-sec cl" aria-labelledby="cl-h">
        <div className="cl-top">
          <header>
            <p className="wb-eyebrow"><GManifest size={16} />Changelog</p>
            <h1 id="cl-h" className="fm-h1">Every change, as it shipped.</h1>
            <p className="wb-sec-lede">Read from Fernway&rsquo;s own commits, newest first, with the moment each one went live. {commits.length} changes so far.</p>
          </header>
          <aside className="cl-by">
            <p className="wb-label">Built and shipped by</p>
            <BuilderCard />
            <a className="cl-gh" href={`${JEROME.github}/fernway/commits/main`} target="_blank" rel="noopener"><GOut size={15} />Every commit on GitHub</a>
          </aside>
        </div>
        <ChangelogList entries={entries} />
        <Pager path="/changelog" page={page} total={commits.length} />
        {older && <p className="cl-foot">Deploys are recorded from the first deploy after the status page shipped; earlier changes went live in the deploys of their day.</p>}
      </section>
      <SiteFooter />
    </div>
  );
}
