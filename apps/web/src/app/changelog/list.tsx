"use client";
// The changelog's entries, grouped by day and timed in the visitor's own zone. Until the page is running in the
// browser it shows UTC, so the server and the first render agree.
import { useSyncExternalStore } from "react";
import { GCheck, GOut, GRoute } from "@/ui/glyphs";

export type Entry = { n: number; hash: string; at: string; title: string; notes: string[]; deployedAt: string | null; live: boolean };

const REPO = "https://github.com/jeromebadour/fernway";
const useInBrowser = () => useSyncExternalStore(() => () => {}, () => true, () => false);

export function ChangelogList({ entries }: { entries: Entry[] }) {
  const local = useInBrowser();
  const zone = local ? undefined : "UTC";
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: zone });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone }) + (local ? "" : " UTC");
  const days: { label: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const label = day(e.at);
    if (days.at(-1)?.label !== label) days.push({ label, items: [] });
    days.at(-1)!.items.push(e);
  }
  return (
    <div className="cl-days">
      {days.map((d) => (
        <section key={d.label} className="cl-day" aria-label={d.label}>
          <h2>{d.label}</h2>
          <ol>
            {d.items.map((e) => (
              <li key={e.hash} className="cl-entry">
                <span className="cl-n">{e.n}</span>
                <div className="cl-body">
                  <p className="cl-meta">
                    <time dateTime={e.at}>{time(e.at)}</time>
                    <a href={`${REPO}/commit/${e.hash}`} target="_blank" rel="noopener"><GOut size={13} /><code>{e.hash.slice(0, 7)}</code></a>
                    {e.live && <span className="cl-stamp cl-live"><GRoute size={12} />Live now</span>}
                    {!e.live && e.deployedAt && <span className="cl-stamp"><GCheck size={12} />Deployed {time(e.deployedAt)}{day(e.deployedAt) !== d.label ? `, ${day(e.deployedAt)}` : ""}</span>}
                  </p>
                  <h3>{e.title}</h3>
                  {e.notes.length > 0 && <ul>{e.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
