import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { logStates, type LogState } from "@fernway/delivery";
import { GFind, GManifest } from "@/ui/glyphs";
import { Pager } from "@/ui/pager";
import { stamp } from "@/ui/when";
import { stateWord } from "../states";
import { LogSearch } from "../log/search";


const chips: { k: LogState | "all"; label: string; tone: string }[] = [
  { k: "all", label: "All", tone: "in" }, { k: "moving", label: "Moving", tone: "in" }, { k: "waiting", label: "Waiting", tone: "re" },
  { k: "signed", label: "Signed for", tone: "ok" }, { k: "held", label: "Held", tone: "hz" }, { k: "returned", label: "Returned", tone: "hz" },
];
const sourceWord: Record<string, string> = { form: "Form", embed: "Embed", wordpress: "WordPress", laravel: "Laravel", api: "API", import: "Import", demo: "Demo", stripe: "Stripe" };

// The sync log: every lead the account sent, newest first, 15 a page; by state, and found by waybill, name, email,
// company or phone. Each row opens the lead.
export async function Log({ who, searchParams }: { who: ConsoleWho; searchParams: Promise<{ q?: string; state?: string; page?: string }> }) {
  const w = who.when;
  const sp = await searchParams;
  const state = logStates.find((s) => s === sp.state);
  const q = (sp.q ?? "").slice(0, 120);
  const v = await who.data.log({ q, state, page: Number(sp.page) || 1 });
  const all = Object.values(v.counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GManifest size={16} />Sync log</p>
        <h1 className="ac-h1">Every lead, and what GHL said.</h1>
      </header>
      <div className="cn-filter">
        <nav className="cn-chips" aria-label="By state">
          {chips.map((c) => {
            const n = c.k === "all" ? all : v.counts[c.k];
            const on = (c.k === "all" && !state) || c.k === state;
            const href = `${who.base}/log${c.k === "all" ? (q ? `?q=${encodeURIComponent(q)}` : "") : `?state=${c.k}${q ? `&q=${encodeURIComponent(q)}` : ""}`}`;
            return <Link key={c.k} href={href} aria-current={on ? "page" : undefined} className={`cn-chip cn-chip-${c.tone}`}>{c.label}<b>{n.toLocaleString("en-US")}</b></Link>;
          })}
        </nav>
        <LogSearch q={q} state={state} />
      </div>

      {v.rows.length === 0 ? (
        <p className="bl-empty"><GFind size={16} />{q ? <>No lead matches <b>{q}</b>{state ? " in this state" : ""}.</> : "No leads here yet."}</p>
      ) : (
        <table className="bl-table cn-log">
          <thead><tr><th className="bl-num">#</th><th>Waybill</th><th>Lead</th><th>Route</th><th>From</th><th>State</th><th>Picked up</th></tr></thead>
          <tbody>
            {v.rows.map((r, i) => {
              const s = stateWord(r.state, r.tries);
              return (
                <tr key={r.shipmentId}>
                  <td className="bl-num">{v.total - (v.page - 1) * 15 - i}</td>
                  <td><Link className="cn-wb" href={`${who.base}/lead/${r.shipmentId}`}>{r.waybill}</Link></td>
                  <td className="cn-who">{r.who}{(r.email || r.company) && <em>{[r.company, r.email].filter(Boolean).join(" · ")}</em>}</td>
                  <td>{r.route}</td>
                  <td>{sourceWord[r.source] ?? r.source}</td>
                  <td>
                    <span className={`bl-chip bl-chip-${s.tone}`}><s.G size={13} />{s.word}</span>
                    {r.reason && <em className="cn-reason">{r.reason}</em>}
                  </td>
                  <td className="cn-mono">{stamp(r.at, w)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Pager path={`${who.base}/log`} page={v.page} total={v.total} query={{ q: q || undefined, state }} />
    </>
  );
}
