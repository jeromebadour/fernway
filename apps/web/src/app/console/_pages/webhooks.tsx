import type { ConsoleWho } from "@/lib/console-data";
import Link from "next/link";
import { hookWords } from "@fernway/delivery";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GHold, GManifest, GResend, GSignal } from "@/ui/glyphs";
import { stamp, time } from "@/ui/when";
import { DeliveryResend, HookEdit, HookMake, HookRemove, HookTest } from "../webhooks/editor";

const deliveryWord = { delivered: { w: "Delivered", tone: "ok", G: GCheck }, waiting: { w: "Retrying", tone: "re", G: GResend }, failed: { w: "Failed", tone: "hz", G: GHold } } as const;

// Webhooks: the account's own endpoints, each with the events it hears and how its last day went, and the latest
// deliveries, each with what Fernway sent and what the endpoint answered.
export async function Webhooks({ who }: { who: ConsoleWho }) {
  const v = await who.data.hooks();
  const w = who.when;
  const can = who.role !== "member";
  return (
    <>
      <header className="ac-head cn-sec-head">
        <div>
          <p className="wb-eyebrow"><GSignal size={16} />Webhooks</p>
          <h1 className="ac-h1">Your systems hear it first.</h1>
        </div>
        {can && v.endpoints.length < 5 && <HookMake />}
      </header>
      <p className="rt-lede">Fernway POSTs each lead event to your endpoints as JSON, signed with each endpoint&apos;s own secret. A refused call is tried again on the leads&apos; own clock. <Link className="wh-doc" href="/docs/webhooks"><GManifest size={14} />How to check the signature</Link></p>

      <ol className="rt-list">
        {v.endpoints.map((e) => {
          const bad = e.day.failed > 0 || (e.lastStatus !== null && (e.lastStatus < 200 || e.lastStatus >= 300));
          return (
            <li key={e.id} className="rt-card wh-card">
              <div className="rt-head">
                <span className={`bl-chip ${bad ? "bl-chip-hz" : "bl-chip-ok"}`}>{bad ? <GHold size={13} /> : <GCheck size={13} />}{bad ? "Failing" : e.lastAt ? "Delivering" : "Ready"}</span>
                <h2 className="rt-name">{e.label}</h2>
                {can && <span className="ef-do"><HookTest id={e.id} label={e.label} /><HookEdit hook={{ id: e.id, label: e.label, url: e.url, events: e.events }} /><HookRemove id={e.id} label={e.label} /></span>}
              </div>
              <p className="wh-url-line"><code>{e.url}</code></p>
              <p className="wh-events">{e.events.map((x) => <span key={x} className="rt-tag"><GSignal size={11} />{hookWords[x]}</span>)}</p>
              <dl className="rt-facts">
                <div><dt>Delivered, 24 h</dt><dd className={e.day.delivered ? "cn-ok" : ""}>{e.day.delivered}</dd></div>
                <div><dt>Retrying</dt><dd>{e.day.waiting}</dd></div>
                <div><dt>Failed, 24 h</dt><dd className={e.day.failed ? "cn-hz" : ""}>{e.day.failed}</dd></div>
                <div><dt>Last call</dt><dd>{e.lastAt ? <><Ago iso={e.lastAt} />{e.lastStatus !== null ? ` · ${e.lastStatus}` : ""}</> : "None yet"}</dd></div>
                <div><dt>Added by</dt><dd>{e.madeBy}</dd></div>
              </dl>
            </li>
          );
        })}
      </ol>
      {v.endpoints.length === 0 && <p className="bl-empty"><GSignal size={16} />No endpoints yet.{can ? " Add one, copy its secret, and your system hears about every lead." : ""}</p>}

      <section className="bl-sec" aria-labelledby="wh-d-h">
        <h2 id="wh-d-h" className="bl-h2"><GClock size={18} />Latest deliveries</h2>
        {v.deliveries.length === 0 ? <p className="bl-empty"><GSignal size={16} />Nothing sent yet.</p> : (
          <ol className="wh-list">
            {v.deliveries.map((d) => {
              const s = deliveryWord[d.state];
              return (
                <li key={d.id}>
                  <details>
                    <summary>
                      <time className="cn-mono">{stamp(d.at, w)}</time>
                      <span className="wh-ev"><GSignal size={13} />{hookWords[d.event]}</span>
                      <span className="wh-wb">{d.shipmentId && d.waybill ? <Link className="cn-wb" href={`${who.base}/lead/${d.shipmentId}`}>{d.waybill}</Link> : <em>Test</em>}</span>
                      <span className="wh-to">{d.endpoint}</span>
                      <span className={`bl-chip bl-chip-${s.tone}`}><s.G size={13} />{s.w}{d.status !== null ? ` · ${d.status}` : ""}</span>
                      <span className="wh-meta">{[d.tries ? `try ${d.tries}` : null, d.ms !== null ? `${d.ms} ms` : null, d.nextAt ? `next ${time(d.nextAt, w)}` : null].filter(Boolean).join(" · ")}</span>
                      {can && d.state === "failed" && d.shipmentId && <DeliveryResend id={d.id} />}
                    </summary>
                    <div className="cn-call">
                      <div><p className="cn-call-k">Fernway sent</p><pre>{JSON.stringify(d.payload, null, 2)}</pre></div>
                      <div><p className="cn-call-k">The endpoint answered {d.status ?? "nothing in time"}</p><pre>{d.answer || "No answer"}</pre></div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
