import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { SHEET_HEADER } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GHold, GOut, GSheet } from "@/ui/glyphs";
import { day, stamp } from "@/ui/when";
import { CopyEmail, SheetLink, SheetUnlink } from "../sheets/editor";

// Google Sheets: the account's linked sheet, where every lead is a row kept up to date. The page says which sheet,
// since when and how the writing goes, what each row holds, and the rows written last.
export async function Sheets({ who }: { who: ConsoleWho }) {
  const v = await who.data.sheet();
  const w = who.when;
  const can = who.role !== "member";
  const l = v.link;

  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GSheet size={16} />Google Sheets</p>
          <h1 className="ac-h1">Every lead, in your sheet.</h1>
        </div>
        {can && v.serviceEmail && !l && <SheetLink email={v.serviceEmail} />}
      </header>
      <p className="rt-lede">Link one Google Sheet and each lead becomes a row on its own tab, Fernway leads. The row follows the lead: signed for, held, resent, scored.</p>

      {!v.serviceEmail ? (
        <p className="cn-held"><GHold size={16} /><span>Google Sheets isn&apos;t set up on this server yet.</span></p>
      ) : l ? (
        <section className="rt-card sh-card" aria-label="The linked sheet">
          <div className="rt-head">
            <span className={`bl-chip ${l.lastError ? "bl-chip-hz" : "bl-chip-ok"}`}>{l.lastError ? <GHold size={13} /> : <GCheck size={13} />}{l.lastError ? "Needs a look" : "Writing"}</span>
            <h2 className="rt-name"><GSheet size={18} />{l.title}</h2>
            <span className="ef-do">
              <a className="wb-ghost fm-btn" href={l.url} target="_blank" rel="noopener"><GOut size={15} />Open the sheet</a>
              {can && <><SheetLink email={v.serviceEmail} change /><SheetUnlink title={l.title} /></>}
            </span>
          </div>
          {l.lastError && <p className="cn-held sh-err"><GHold size={16} /><span><b>Google said:</b> {l.lastError}. Rows wait and are tried again.</span></p>}
          <dl className="rt-facts">
            <div><dt>Rows written</dt><dd className={v.rows.written ? "cn-ok" : ""}>{v.rows.written.toLocaleString("en-US")}</dd></div>
            <div><dt>Waiting</dt><dd>{v.rows.waiting}</dd></div>
            <div><dt>Given up</dt><dd className={v.rows.givenUp ? "cn-hz" : ""}>{v.rows.givenUp}</dd></div>
            <div><dt>Last written</dt><dd>{l.lastOkAt ? <Ago iso={l.lastOkAt} /> : "Not yet"}</dd></div>
            <div><dt>Leads from</dt><dd>{day(l.since, w)}</dd></div>
            <div><dt>Linked by</dt><dd>{l.madeBy}</dd></div>
          </dl>
        </section>
      ) : (
        <section className="rt-card sh-card sh-empty" aria-label="No sheet linked">
          <h2 className="rt-name"><GSheet size={18} />No sheet linked yet</h2>
          <ol className="sh-steps">
            <li><span>In your Google Sheet, press <b>Share</b> and add Fernway&apos;s address as an <b>Editor</b>.</span><CopyEmail email={v.serviceEmail} /></li>
            <li><span>{can ? <>Press <b>Link a sheet</b> and paste the sheet&apos;s link.</> : "The owner or an admin pastes the sheet's link here."}</span></li>
          </ol>
        </section>
      )}

      <section className="bl-sec" aria-labelledby="sh-cols-h">
        <h2 id="sh-cols-h" className="bl-h2"><GSheet size={18} />What each row holds</h2>
        <ol className="sh-cols">
          {SHEET_HEADER.map((h, i) => <li key={h}><b>{String.fromCharCode(65 + i)}</b>{h}</li>)}
        </ol>
        <p className="ls-p ls-small">Written as plain text, so nothing a lead types is ever run as a formula. Sorting, filtering or adding your own columns to the right is fine: Fernway finds each lead&apos;s row again by its waybill.</p>
      </section>

      <section className="bl-sec" aria-labelledby="sh-latest-h">
        <h2 id="sh-latest-h" className="bl-h2"><GClock size={18} />Rows written last</h2>
        {v.latest.length === 0 ? (
          <p className="bl-empty"><GSheet size={16} />{l ? "No row yet. The next lead appears here a few seconds after it is picked up." : "Link a sheet and the next lead becomes its first row."}</p>
        ) : (
          <table className="bl-table sh-table">
            <thead><tr><th className="bl-num">#</th><th>Written</th><th>Waybill</th><th>Lead</th><th>Row</th></tr></thead>
            <tbody>
              {v.latest.map((r, i) => (
                <tr key={r.shipmentId}>
                  <td className="bl-num">{i + 1}</td>
                  <td className="cn-mono">{stamp(r.at, w)}</td>
                  <td><Link className="cn-wb" href={`${who.base}/lead/${r.shipmentId}`}>{r.waybill}</Link></td>
                  <td className="cn-who">{r.who}</td>
                  <td><span className="sh-row"><GSheet size={13} />Row {r.row}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
