import type { Metadata } from "next";
import Link from "next/link";
import { ghlSide, recordView, trackToken, type GhlContact } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { GCheck, GDepot, GDown, GHold, GManifest, GOut, GRecord } from "@/ui/glyphs";
import { day, stamp } from "@/ui/when";

export const metadata: Metadata = { title: "Your record · Fernway" };
export const dynamic = "force-dynamic";

type Line = { k: string; fw: string | null; ghl: string | null };

// Your record: two manifests side by side, what Fernway holds about you and what Fernway's own GHL holds (read live),
// line by line on the same rows; then every lead you sent through Fernway's forms with its receipt; then the file.
export default async function Record() {
  const m = await requirePerson("/account/record");
  const w = await whenFor(m);
  const { deps, accountId: site } = intake();
  const v = (await recordView(delivery().db, m.userId, m.accountId, site))!;
  const g = await ghlSide(deps, site, v.leads.map((l) => l.contactId).filter((c): c is string => !!c));
  const c: GhlContact | null = g.reached ? g.contacts[0] ?? null : null;
  const name = c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;
  const lines: Line[] = [
    { k: "Name", fw: v.person.name, ghl: name },
    { k: "Email", fw: v.person.email, ghl: c?.email ?? null },
    { k: "Phone", fw: null, ghl: c?.phone ?? null },
    { k: "Company", fw: v.account.name, ghl: c?.companyName ?? null },
    { k: "Website", fw: null, ghl: c?.website ?? null },
    { k: "Tags", fw: null, ghl: c?.tags.length ? c.tags.join(", ") : null },
    { k: "Since", fw: day(v.person.createdAt, w), ghl: c?.dateAdded ? day(c.dateAdded, w) : null },
  ];
  const fernwayOnly = [
    ["Email confirmed", v.person.emailConfirmedAt ? day(v.person.emailConfirmedAt, w) : "Not yet"],
    ["Account", `AC ${String(v.account.id).padStart(6, "0")}, ${v.account.role}`],
    ["Plan", v.account.plan ? v.account.plan.charAt(0).toUpperCase() + v.account.plan.slice(1) : "Trial"],
    ["Password", `a scrypt hash, changed ${day(v.person.passwordChangedAt, w)}`],
    ["Two-step", v.person.twoStepSince ? `on since ${day(v.person.twoStepSince, w)}, its key sealed` : "off"],
    ["Time zone", v.person.timeZone.replaceAll("_", " ")],
    ["Signed in on", `${v.counts.devicesSignedIn} ${v.counts.devicesSignedIn === 1 ? "device" : "devices"}`],
    ["API keys", `${v.counts.apiKeysLive} live, each kept only as a fingerprint`],
    ["Invoices", `${v.counts.invoices}`],
  ];
  const { cfg } = delivery();
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GRecord size={16} />Your record</p>
        <h1 className="ac-h1">Everything held about you, side by side.</h1>
      </header>

      <section className="rc-man" aria-label="Held by Fernway and by GHL">
        <div className="rc-cols">
          <span />
          <p className="rc-col rc-fw"><GManifest size={15} />Held by Fernway</p>
          <p className="rc-col rc-ghl"><GDepot size={15} />Held by GHL{g.reached ? <em>read just now</em> : null}</p>
        </div>
        {lines.map((l, i) => (
          <div key={l.k} className="rc-line">
            <span className="rc-k"><b>{String(i + 1).padStart(2, "0")}</b>{l.k}</span>
            <span className={l.fw ? "rc-v" : "rc-v rc-none"}>{l.fw ?? "Not kept"}</span>
            <span className={l.ghl ? (l.fw && l.ghl.toLowerCase() !== l.fw.toLowerCase() && l.k !== "Since" ? "rc-v rc-diff" : "rc-v") : "rc-v rc-none"}>
              {g.reached ? l.ghl ?? (c ? "Not kept" : "Nothing") : "Not read"}
            </span>
          </div>
        ))}
        {!g.reached && <p className="rc-note rc-note-hz"><GHold size={14} />GHL could not be read just now, so its side is empty here. Reload in a minute.</p>}
        {g.reached && !c && <p className="rc-note"><GCheck size={14} />GHL holds nothing of yours: you never sent a form on this site with {v.person.email}.</p>}
        {g.reached && g.contacts.length > 1 && <p className="rc-note"><GManifest size={14} />GHL holds {g.contacts.length} contacts made from your leads; the first is shown, the file has them all.</p>}
      </section>

      <section className="bl-sec" aria-labelledby="rc-only-h">
        <h2 id="rc-only-h" className="bl-h2"><GManifest size={18} />Only in Fernway</h2>
        <dl className="rc-only">
          {fernwayOnly.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
        </dl>
      </section>

      <section className="bl-sec" aria-labelledby="rc-leads-h">
        <h2 id="rc-leads-h" className="bl-h2"><GManifest size={18} />Your leads in Fernway&apos;s own GHL</h2>
        {v.leads.length === 0 ? <p className="bl-empty"><GManifest size={16} />None. A lead appears here when a form on this site is sent with {v.person.email}.</p> : (
          <table className="bl-table">
            <thead><tr><th className="bl-num">#</th><th>Waybill</th><th>Form</th><th>Sent</th><th>State</th><th><span className="bl-sr">Receipt</span></th></tr></thead>
            <tbody>
              {v.leads.map((l, i) => (
                <tr key={l.shipmentId}>
                  <td className="bl-num">{v.leads.length - i}</td>
                  <td className="bl-inv-no">{l.waybill}</td>
                  <td>{l.route}</td>
                  <td>{stamp(l.at, w)}</td>
                  <td><span className={`bl-chip bl-chip-${l.state === "signed" ? "ok" : l.state === "held" || l.state === "returned" ? "hz" : "in"}`}>
                    {l.state === "signed" ? <><GCheck size={13} />Signed for</> : l.state === "held" ? <><GHold size={13} />Held</> : l.state === "returned" ? <><GHold size={13} />Returned</> : "In transit"}</span></td>
                  <td className="bl-links"><Link href={`/track/${trackToken(cfg.key, l.shipmentId)}`}><GOut size={14} />Receipt</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="bl-small">Leads from this site&apos;s forms are removed from GHL and from Fernway after 30 days; the move to Customer stays while the account does.</p>
      </section>

      <div className="rc-file">
        <a className="wb-go fm-btn" href="/api/account/record" download><GDown size={16} />Download your record</a>
        <span>A JSON file with both sides exactly as above, and every lead.</span>
      </div>
    </>
  );
}
