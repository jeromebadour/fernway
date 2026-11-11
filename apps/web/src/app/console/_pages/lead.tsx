import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GBuilding, GCheck, GClock, GGlobe, GHand, GHold, GJump, GMail, GManifest, GNote, GOut, GPhone, GResend, GRoute, GScan, GUser } from "@/ui/glyphs";
import { day, time } from "@/ui/when";
import { ResendButton } from "../actions";
import { stateWord } from "../states";


const scanWord: Record<string, { what: string; G: typeof GScan; tone: string }> = {
  picked_up: { what: "Picked up", G: GScan, tone: "in" },
  checked: { what: "Checked", G: GCheck, tone: "ok" },
  handed: { what: "Handed to GHL", G: GHand, tone: "in" },
  signed: { what: "Signed for", G: GManifest, tone: "ok" },
  retry_scheduled: { what: "GHL said not now · re-send booked", G: GResend, tone: "re" },
  resent: { what: "Resent", G: GResend, tone: "re" },
  held: { what: "Held", G: GHold, tone: "hz" },
  returned: { what: "Returned", G: GHold, tone: "hz" },
};
const stepWord: Record<string, string> = { contact: "Contact", note: "Note", appointment: "Meeting", opportunity: "Pipeline" };
const sourceWord: Record<string, string> = { form: "A website form", embed: "The embed form", wordpress: "WordPress", laravel: "Laravel", api: "Your code (API)", import: "An import", demo: "The demo", stripe: "A Stripe payment" };

// One lead: who it is, how it came in and where it was sent, then every scan in order. A scan that called GHL opens to
// show exactly what Fernway sent and what GHL answered, with how long GHL took.
export async function Lead({ who, params }: { who: ConsoleWho; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = /^\d+$/.test(id) ? await who.data.lead(Number(id)) : null;
  if (!v) notFound();
  const w = who.when;
  const s = stateWord(v.state, v.tries);
  const c = v.contact;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "No name";
  const receipt = who.data.receipt(v.shipmentId);
  const fields: [typeof GUser, string, string | undefined][] = [
    [GMail, "Email", c.email], [GPhone, "Phone", c.phone], [GBuilding, "Company", c.companyName], [GGlobe, "Website", c.website],
  ];

  return (
    <>
      <p className="cn-back"><Link href={`${who.base}/log`}><GJump size={14} />Sync log</Link></p>
      <header className="cn-lead-head">
        <div>
          <p className="wb-eyebrow"><GManifest size={16} />Waybill</p>
          <h1 className="cn-lead-no">{v.waybill}</h1>
          <p className="cn-lead-sub">{sourceWord[v.source] ?? v.source} to <b>{v.route.label}</b> · picked up {day(v.createdAt, w)}, {time(v.createdAt, w, true)}</p>
        </div>
        <div className="cn-lead-do">
          <span className={`cn-stamp cn-stamp-${s.tone}`}><s.G size={15} />{s.word}</span>
          {(v.state === "held" || v.state === "returned") && <ResendButton id={v.shipmentId} waybill={v.waybill} big />}
          {receipt && <Link className="wb-ghost fm-btn cn-receipt" href={receipt}><GOut size={15} />Receipt</Link>}
        </div>
      </header>
      {v.reason && <p className="cn-held"><GHold size={16} /><span><b>GHL said:</b> {v.reason}</span></p>}
      {v.state === "waiting" && v.nextTryAt && <p className="cn-waits"><GClock size={16} /><span>Try {v.tries + 1} of 8 goes at <b>{time(v.nextTryAt, w, true)}</b>.</span></p>}

      <div className="cn-lead-body">
        <aside className="cn-person">
          <div className="cn-person-top">
            <span className="wb-ava">{name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
            <div><p className="cn-person-name">{name}</p><p className="cn-person-co">{c.companyName ?? "No company"}</p></div>
          </div>
          <dl className="cn-person-f">
            {fields.map(([G, k, val]) => <div key={k}><dt><G size={14} />{k}</dt><dd className={val ? "" : "cn-none"}>{val ?? "Not sent"}</dd></div>)}
            {v.meeting && <div><dt><GClock size={14} />Meeting</dt><dd>{day(v.meeting, w)}, {time(v.meeting, w)}</dd></div>}
          </dl>
          {c.message && <div className="cn-msg"><p className="cn-msg-k"><GNote size={14} />Message</p><p>{c.message}</p></div>}
          <dl className="cn-ids">
            <div><dt>Your id for it</dt><dd>{v.idempotencyKey}</dd></div>
            <div><dt>GHL contact</dt><dd>{v.ghl.contactId ?? "Not yet"}</dd></div>
            <div><dt>GHL opportunity</dt><dd>{v.ghl.opportunityId ?? (v.state === "signed" ? "None: contact-only route" : "Not yet")}</dd></div>
            {(v.ghl.noteId || c.message) && <div><dt>GHL note</dt><dd>{v.ghl.noteId ?? "Not yet"}</dd></div>}
            {(v.ghl.appointmentId || v.meeting) && <div><dt>GHL meeting</dt><dd>{v.ghl.appointmentId ?? "Not yet"}</dd></div>}
          </dl>
        </aside>

        <section className="cn-scans" aria-label="Scans">
          <h2 className="bl-h2"><GRoute size={18} />Every scan</h2>
          <ol>
            {v.scans.map((sc) => {
              const k = scanWord[sc.kind] ?? { what: sc.kind, G: GScan, tone: "in" };
              const called = sc.sent !== null || sc.status !== null;
              const head = (
                <>
                  <time className="cn-scan-t">{time(sc.at, w, true)}</time>
                  <span className={`cn-scan-g cn-${k.tone}`}><k.G size={14} /></span>
                  <span className="cn-scan-w">
                    <b>{k.what}{sc.step ? ` · ${stepWord[sc.step] ?? sc.step}` : ""}</b>
                    <em>{[sc.try ? `try ${sc.try}` : null, sc.status !== null ? `GHL ${sc.status}` : null, sc.ms !== null ? `${sc.ms} ms` : null, sc.note].filter(Boolean).join(" · ")}</em>
                  </span>
                </>
              );
              return (
                <li key={sc.id} className={called ? "cn-scan cn-scan-call" : "cn-scan"}>
                  {called ? (
                    <details>
                      <summary>{head}<span className="cn-scan-open">What was sent</span></summary>
                      <div className="cn-call">
                        <div><p className="cn-call-k">Fernway sent</p><pre>{sc.sent ? JSON.stringify(sc.sent, null, 2) : "Nothing"}</pre></div>
                        <div><p className="cn-call-k">GHL answered {sc.status ?? "nothing in time"}</p><pre>{sc.answer ? pretty(sc.answer) : "No answer"}</pre></div>
                      </div>
                    </details>
                  ) : <div className="cn-scan-row">{head}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}

const pretty = (text: string) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } };
