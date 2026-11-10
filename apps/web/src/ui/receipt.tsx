"use client";
// A live tracking receipt: the visitor's own waybill, scan by scan, the same object as the landing's example. While the
// lead is travelling it asks for news every second (every 5 s while it waits for a retry); once signed for, held or
// returned it stops. Times are the visitor's own clock.
import { useEffect, useState } from "react";
import type { TrackView } from "@fernway/delivery";
import { GCheck, GClock, GHand, GHold, GManifest, GResend, GRoute, GScan } from "./glyphs";
import { meetingText } from "./slot-picker";

const scanText: Record<string, { what: string; G: typeof GScan; tone: string }> = {
  picked_up: { what: "Picked up", G: GScan, tone: "in" },
  checked: { what: "Checked", G: GCheck, tone: "ok" },
  handed: { what: "Handed to GHL", G: GHand, tone: "in" },
  signed: { what: "Signed for", G: GManifest, tone: "ok" },
  retry_scheduled: { what: "GHL said not now · re-send booked", G: GResend, tone: "re" },
  resent: { what: "Re-sent", G: GResend, tone: "re" },
  held: { what: "Held", G: GHold, tone: "hz" },
  returned: { what: "Returned", G: GHold, tone: "hz" },
};

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleTimeString("en-GB", { hour12: false })}.${String(Math.floor(d.getMilliseconds() / 10)).padStart(2, "0")}`;
};
const travelling = (state: string) => state === "picked_up" || state === "in_transit" || state === "waiting";

function stamp(v: TrackView) {
  if (v.state === "signed") {
    const signed = v.scans.find((s) => s.kind === "signed");
    const secs = signed ? (Date.parse(signed.at) - Date.parse(v.pickedUpAt)) / 1000 : null;
    return { cls: "wb-stamp-ok", G: GCheck, text: secs === null ? "Signed for" : `Signed for in ${secs.toFixed(1)} s` };
  }
  if (v.state === "held") return { cls: "rc-stamp-hz", G: GHold, text: "Held" };
  if (v.state === "returned") return { cls: "rc-stamp-hz", G: GHold, text: "Returned" };
  if (v.state === "waiting") return { cls: "rc-stamp-re", G: GResend, text: "Re-send booked" };
  return { cls: "rc-stamp-in", G: GRoute, text: "In transit" };
}

export function Receipt({ initial, token }: { initial: TrackView; token: string }) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    if (!travelling(v.state)) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/track/${token}`, { cache: "no-store" });
        if (r.ok) setV((await r.json()).view);
      } catch { /* the next tick asks again */ }
    }, v.state === "waiting" ? 5000 : 1000);
    return () => clearTimeout(t);
  }, [v, token]);

  const s = stamp(v);
  const name = [v.consignee.firstName, v.consignee.lastName].filter(Boolean).join(" ");
  const initials = (v.consignee.firstName?.[0] ?? "") + (v.consignee.lastName?.[0] ?? "") || "··";
  return (
    <article className="wb-bill rc-bill" aria-live="polite">
      <div className="wb-perf" aria-hidden="true" />
      <div className="wb-bill-head">
        <div>
          <p className="wb-label">Waybill <span className="rc-yours">Yours</span></p>
          <p className="wb-no">{v.number}</p>
        </div>
        <div className={`wb-stamp rc-stamp ${s.cls}`}><s.G size={15} />{s.text}</div>
      </div>
      <div className="wb-route">
        <div><p className="wb-label">From</p><p>Website<span>Fernway&rsquo;s {v.route.toLowerCase()} form</span></p></div>
        <GRoute size={22} />
        <div><p className="wb-label">To</p><p>GoHighLevel<span>Fernway&rsquo;s sandbox · {v.route}</span></p></div>
      </div>
      {v.meeting && <p className="fm-meet"><GClock size={15} />Demo <b>{meetingText(v.meeting)}</b></p>}
      <div className="wb-consignee">
        <span className="wb-ava">{initials.toUpperCase()}</span>
        <div>
          <p className="wb-name">{name || "Your lead"}</p>
          <p className="wb-org">{[v.consignee.company, v.consignee.email].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <ol className="wb-scans">
        {v.scans.map((scan, i) => {
          let sc = scan;
          const t = sc.kind === "handed" && sc.step === "note"
            ? { what: "Message added as a note", G: GManifest, tone: "in" }
            : sc.kind === "handed" && sc.step === "appointment"
              ? { what: "Demo booked in GHL's calendar", G: GClock, tone: "in" }
              : scanText[sc.kind] ?? { what: sc.kind, G: GScan, tone: "in" };
          // The meeting's time reads in the visitor's own zone, not as the stored ISO.
          if (sc.kind === "handed" && sc.step === "appointment" && v.meeting) sc = { ...sc, note: meetingText(v.meeting) };
          const detail = [sc.try ? `try ${sc.try}` : null, sc.status ? `GHL ${sc.status}` : null, sc.note].filter(Boolean).join(" · ");
          return (
            <li key={`${sc.kind}-${i}`} className={`tone-${t.tone}`}>
              <span className="wb-t">{clock(sc.at)}</span>
              <span className="wb-node"><t.G size={14} /></span>
              <span className="wb-what">{t.what}{detail && <span>{detail}</span>}</span>
            </li>
          );
        })}
        {travelling(v.state) && (
          <li className="tone-in rc-next">
            <span className="wb-t">··:··:··</span>
            <span className="wb-node"><GRoute size={14} /></span>
            <span className="wb-what">{v.state === "waiting" ? "Waiting for the next try" : "On its way to GHL"}</span>
          </li>
        )}
      </ol>
    </article>
  );
}
