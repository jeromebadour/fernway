"use client";
// Picking a meeting time: the calendar's real free times, in the visitor's own time zone. Days first (only days that
// have a free time), then that day's times. Every state says what is happening: reading, nothing free, can't read.
import { useEffect, useMemo, useState } from "react";
import { GClock, GResend } from "./glyphs";

type Load = { state: "loading" } | { state: "ready"; slots: string[] } | { state: "failed"; closed: boolean };

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
export const meetingText = (iso: string) =>
  `${new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${timeOf(iso)}`;

// The form gives it a new key when the times must be read again (a time was just taken, or "Send another").
export function SlotPicker({ value, onPick, bad }: { value: string; onPick: (iso: string) => void; bad?: boolean }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [day, setDay] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/slots", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (j.ok) setLoad({ state: "ready", slots: j.slots });
        else setLoad({ state: "failed", closed: j.reason === "closed" });
      })
      .catch(() => live && setLoad({ state: "failed", closed: false }));
    return () => { live = false; };
  }, [tick]);

  const days = useMemo(() => {
    if (load.state !== "ready") return [];
    const by = new Map<string, string[]>();
    for (const s of load.slots) by.set(dayKey(s), [...(by.get(dayKey(s)) ?? []), s]);
    return [...by.entries()].slice(0, 10);
  }, [load]);
  const shownDay = day && days.some(([k]) => k === day) ? day : days[0]?.[0] ?? null;
  const times = days.find(([k]) => k === shownDay)?.[1] ?? [];

  if (load.state === "loading") return <p className="sp-state"><GClock size={15} />Reading the calendar&hellip;</p>;
  if (load.state === "failed") {
    return (
      <p className="sp-state sp-state-hz">
        <GClock size={15} />
        {load.closed ? "Booking isn't open yet. Try again later." : "Couldn't read the calendar."}
        {!load.closed && <button type="button" className="sp-retry" onClick={() => { setLoad({ state: "loading" }); setTick(tick + 1); }}><GResend size={14} />Try again</button>}
      </p>
    );
  }
  if (days.length === 0) return <p className="sp-state"><GClock size={15} />No free times in the next two weeks. Use Contact sales instead.</p>;

  return (
    <div className={`sp${bad ? " sp-bad" : ""}`}>
      <div className="sp-days" role="tablist" aria-label="Day">
        {days.map(([k, list]) => (
          <button key={k} type="button" role="tab" aria-selected={k === shownDay} className={k === shownDay ? "sp-day sp-on" : "sp-day"}
            onClick={() => setDay(k)}>
            <b>{dayName(list[0]!)}</b><em>{list.length} free</em>
          </button>
        ))}
      </div>
      <div className="sp-times" role="radiogroup" aria-label="Time">
        {times.map((iso) => (
          <button key={iso} type="button" role="radio" aria-checked={iso === value} className={iso === value ? "sp-time sp-on" : "sp-time"}
            onClick={() => onPick(iso)}>
            {timeOf(iso)}
          </button>
        ))}
      </div>
      <p className="sp-zone">Times in your time zone, {zone().replace(/_/g, " ")}. 30 minutes each.</p>
    </div>
  );
}
