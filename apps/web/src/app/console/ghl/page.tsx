import type { Metadata } from "next";
import { connectionView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GHold, GKey, GLock, GNodes, GResend, GSilent } from "@/ui/glyphs";
import { day } from "@/ui/when";
import { Disconnect } from "./actions";

export const metadata: Metadata = { title: "GHL connection · Fernway" };
export const dynamic = "force-dynamic";

const problems: Record<string, string> = {
  expired: "That attempt expired. Start again with Reconnect, in this browser, within 15 minutes.",
  declined: "The approval in GHL was cancelled, so nothing changed.",
  agency: "That was an agency, not a sub-account. Install the app into the sub-account Fernway should deliver to.",
  several: "The app went into several sub-accounts. Fernway delivers into one: remove it from the others, then reconnect.",
  refused: "GHL didn't accept the connection. Nothing was saved; try Reconnect again.",
  "not-allowed": "Only the account's owner or an admin connects GHL.",
};
const scopeWords: Record<string, string> = {
  "contacts.write": "Write contacts", "contacts.readonly": "Read contacts", "opportunities.write": "Write opportunities",
  "opportunities.readonly": "Read opportunities", "calendars.readonly": "Read calendars", "calendars/events.readonly": "Read meetings",
  "calendars/events.write": "Book meetings", "locations/customFields.readonly": "Read custom fields", "locations.readonly": "Read the sub-account",
  "workflows.readonly": "Read workflows", "oauth.readonly": "Read the app install", "oauth.write": "Manage the app install",
};

// The GHL connection: whether Fernway can reach the sub-account, the token's health (it renews by itself), how GHL
// answered this account's calls over the last day, and Reconnect or Disconnect for the owner and admins.
export default async function Ghl({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  const m = await requirePerson("/console/ghl");
  const w = await whenFor(m);
  const sp = await searchParams;
  const c = await connectionView(delivery().db, m.accountId);
  const can = m.role !== "member";
  const calls = c.calls.ok + c.calls.refused + c.calls.failed + c.calls.none;
  const part = (n: number) => (calls ? `${(n / calls) * 100}%` : "0");
  const stamp = !c.connected ? { cls: "cn-stamp-hz", G: GSilent, word: "Not connected" }
    : c.status === "needs_reconnect" ? { cls: "cn-stamp-hz", G: GHold, word: "Needs reconnecting" }
    : { cls: "cn-stamp-ok", G: GCheck, word: "Connected" };

  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GNodes size={16} />GHL connection</p>
        <h1 className="ac-h1">How Fernway reaches your GHL.</h1>
      </header>
      {sp.problem && <p className="cn-held" role="alert"><GHold size={16} />{problems[sp.problem] ?? problems.refused}</p>}

      <section className="gh-card" aria-label="The connection">
        <div className="gh-top">
          <div>
            <p className="gh-k">Sub-account</p>
            <p className="gh-loc">{c.locationId ?? "None"}</p>
          </div>
          <span className={`cn-stamp ${stamp.cls}`}><stamp.G size={14} />{stamp.word}</span>
        </div>
        {c.connected ? (
          <dl className="gh-facts">
            <div><dt><GCheck size={13} />Connected</dt><dd>{day(c.connectedAt!, w)}</dd></div>
            <div><dt><GKey size={13} />Access token</dt><dd>{c.status === "connected" ? <>Good, renews by itself</> : "Refused by GHL"}</dd></div>
            <div><dt><GResend size={13} />Last renewed</dt><dd>{c.refreshedAt ? <Ago iso={c.refreshedAt} /> : "Not yet"}</dd></div>
            <div><dt><GLock size={13} />Permissions</dt><dd>{c.scopes.length} approved</dd></div>
          </dl>
        ) : (
          <p className="gh-none">Fernway has no way into a GHL sub-account for this account. New leads are held with &ldquo;GHL is not connected&rdquo; until it is connected; then each can be resent.</p>
        )}
        {c.lastError && c.status !== "connected" && <p className="gh-err"><GHold size={15} /><span><b>GHL said:</b> {c.lastError}</span></p>}
        {can ? (
          <div className="gh-do">
            <a className="wb-go fm-btn" href="/api/connect/start"><GNodes size={16} />{c.connected ? "Reconnect" : "Connect GHL"}</a>
            {c.connected && <Disconnect location={c.locationId!} />}
            <p className="gh-note">{c.connected ? "Reconnect opens GHL to approve Fernway again: for a refused token, or new permissions." : "Opens GHL, where you pick the sub-account and approve Fernway."}</p>
          </div>
        ) : <p className="gh-note gh-do">The account&apos;s owner or an admin connects and disconnects GHL.</p>}
      </section>

      <section className="gh-health" aria-labelledby="gh-h">
        <div className="cn-day-head">
          <h2 id="gh-h" className="bl-h2"><GClock size={18} />GHL&apos;s answers, last 24 hours</h2>
          <dl className="cn-facts">
            <div><dt>Calls</dt><dd>{calls.toLocaleString("en-US")}</dd></div>
            <div><dt>Typical answer</dt><dd>{c.calls.medianMs === null ? "None yet" : `${c.calls.medianMs} ms`}</dd></div>
            <div><dt>Last call</dt><dd>{c.calls.lastAt ? <Ago iso={c.calls.lastAt} /> : "None yet"}</dd></div>
          </dl>
        </div>
        <div className="gh-bar" role="img" aria-label={`${c.calls.ok} accepted, ${c.calls.refused} refused, ${c.calls.failed} failed, ${c.calls.none} unanswered`}>
          <i className="gh-ok" style={{ width: part(c.calls.ok) }} /><i className="gh-hz" style={{ width: part(c.calls.refused) }} /><i className="gh-re" style={{ width: part(c.calls.failed + c.calls.none) }} />
        </div>
        <ul className="gh-key">
          <li><i className="gh-ok" /><b>{c.calls.ok.toLocaleString("en-US")}</b>accepted (2xx)</li>
          <li><i className="gh-hz" /><b>{c.calls.refused}</b>refused (4xx): held for a fix</li>
          <li><i className="gh-re" /><b>{c.calls.failed + c.calls.none}</b>failed or unanswered: tried again by itself</li>
        </ul>
      </section>

      {c.connected && (
        <section className="gh-scopes" aria-labelledby="gh-s">
          <h2 id="gh-s" className="bl-h2"><GKey size={18} />What Fernway may do in GHL</h2>
          <ul>{c.scopes.map((s) => <li key={s}><GCheck size={13} />{scopeWords[s] ?? s}<code>{s}</code></li>)}</ul>
        </section>
      )}
    </>
  );
}
