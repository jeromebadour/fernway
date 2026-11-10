"use client";
// Preferences: every choice shown as it would read, on a real scan line that changes as you pick; which emails Fernway
// sends, each with the moment that sends it. Saving says what happened.
import { useState } from "react";
import { GCheck, GClock, GHold, GMail, GManifest, GSave } from "@/ui/glyphs";
import { useNow } from "@/ui/use-now";
import { day, time, type When } from "@/ui/when";

type P = { dateStyle: When["dateStyle"]; clock: When["clock"]; emailHeld: boolean; emailReturned: boolean; emailWeekly: boolean };

export function PrefsForm({ initial, timeZone, email }: { initial: P; timeZone: string; email: string }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const now = useNow();
  const at = now === null ? null : new Date(now);
  const w = (o: Partial<When> = {}): When => ({ dateStyle: v.dateStyle, clock: v.clock, timeZone, ...o });
  const changed = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (o: Partial<P>) => { setV({ ...v, ...o }); setState("idle"); };

  async function save() {
    setState("saving");
    const r = await fetch("/api/account/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) })
      .then((x) => x.json()).catch(() => ({ ok: false })) as { ok?: boolean };
    if (r.ok) { setSaved(v); setState("saved"); } else setState("failed");
  }

  const emails: { k: "emailHeld" | "emailReturned" | "emailWeekly"; title: string; when: string; G: typeof GHold; tone: string }[] = [
    { k: "emailHeld", title: "A lead is held", when: "GHL refused it and waiting won't help: the email gives GHL's reason in words and links to the lead's receipt.", G: GHold, tone: "hz" },
    { k: "emailReturned", title: "A lead is returned", when: "All 8 tries over 24 hours went unanswered: the email gives GHL's last answer and links to the lead's receipt.", G: GHold, tone: "hz" },
    { k: "emailWeekly", title: "Monday's summary", when: "Last week's leads, signed for, held and returned, and GHL's slowest day. Mondays at 08:00 your time.", G: GManifest, tone: "in" },
  ];

  return (
    <div className="pf">
      <section className="pf-sec" aria-labelledby="pf-time-h">
        <h2 id="pf-time-h" className="bl-h2"><GClock size={18} />Dates and times</h2>
        <div className="pf-preview" aria-live="polite">
          <span className="pf-preview-k">On a receipt</span>
          <span className="pf-scan"><GManifest size={15} />Signed for</span>
          <time>{at ? `${day(at, w())} · ${time(at, w(), true)}` : ""}</time>
        </div>
        <div className="pf-row">
          <span className="fm-label">Dates</span>
          <div className="pf-chips" role="radiogroup" aria-label="Dates">
            {(["day-month", "month-day", "iso"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={v.dateStyle === d} className={v.dateStyle === d ? "pf-chip pf-on" : "pf-chip"} onClick={() => set({ dateStyle: d })}>
                {v.dateStyle === d && <GCheck size={13} />}{at ? day(at, w({ dateStyle: d })) : d}
              </button>
            ))}
          </div>
        </div>
        <div className="pf-row">
          <span className="fm-label">Clock</span>
          <div className="pf-chips" role="radiogroup" aria-label="Clock">
            {(["24h", "12h"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={v.clock === c} className={v.clock === c ? "pf-chip pf-on" : "pf-chip"} onClick={() => set({ clock: c })}>
                {v.clock === c && <GCheck size={13} />}{at ? time(at, w({ clock: c })) : c}<em>{c === "24h" ? "24-hour" : "12-hour"}</em>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="pf-sec" aria-labelledby="pf-mail-h">
        <h2 id="pf-mail-h" className="bl-h2"><GMail size={18} />Emails to {email}</h2>
        <ul className="pf-mails">
          {emails.map((e) => (
            <li key={e.k}>
              <span className={`pf-mail-g pf-${e.tone}`}><e.G size={18} /></span>
              <div><p className="pf-mail-t">{e.title}</p><p className="pf-mail-w">{e.when}</p></div>
              <button type="button" role="switch" aria-checked={v[e.k]} aria-label={e.title} className={v[e.k] ? "pf-sw pf-sw-on" : "pf-sw"} onClick={() => set({ [e.k]: !v[e.k] } as Partial<P>)}>
                <i /><span>{v[e.k] ? "On" : "Off"}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="bl-small">Emails about the account itself (confirming the address, a password reset, a payment) always arrive.</p>
      </section>

      <div className="ac-save">
        <button type="button" className="wb-go fm-btn" disabled={!changed || state === "saving"} onClick={save}><GSave size={16} />Save changes</button>
        <span className="ac-save-state" role="status">
          {state === "saving" && <><GClock size={14} />Saving</>}
          {state === "saved" && <><GCheck size={14} />Saved. Your account pages read this way now.</>}
          {state === "failed" && <span className="fm-error">Not saved: Fernway could not be reached. Try again.</span>}
          {state === "idle" && changed && "Unsaved changes"}
        </span>
      </div>
    </div>
  );
}
