"use client";
// The device stubs. Signing out another device is undone by signing in there again, so it needs no dialog (2.20); the
// stub moves to "Ended" at once and says so.
import { useState } from "react";
import { Ago } from "@/ui/ago";
import { GCheck, GClock, GDevice, GPhone, GSignOut } from "@/ui/glyphs";

export type DeviceCard = { id: number; device: string; here: boolean; phone: boolean; number: string; since: string; lastSeen: string;
  ended: { at: string; why: string } | null };

const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false })) as Promise<{ ok?: boolean; ended?: number }>;

export function DeviceList({ cards: first }: { cards: DeviceCard[] }) {
  const [cards, setCards] = useState(first);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const live = cards.filter((c) => !c.ended);
  const ended = cards.filter((c) => c.ended);
  const endNow = (ids: number[], why: string) => setCards((cs) => cs.map((c) => ids.includes(c.id) ? { ...c, ended: { at: "Just now", why } } : c));
  const others = live.filter((c) => !c.here);

  return (
    <>
      <div className="dv-bar">
        <p className="dv-count"><b>{live.length}</b>{live.length === 1 ? "device signed in" : "devices signed in"}</p>
        {others.length > 0 && (
          <button type="button" className="wb-ghost fm-btn dv-all" disabled={busy !== null} onClick={async () => {
            setBusy("all");
            const r = await post("/api/account/sign-out", { others: true });
            if (r.ok) { endNow(others.map((c) => c.id), "Signed out from this page"); setSaid(`${r.ended ?? others.length} signed out`); }
            setBusy(null);
          }}>{busy === "all" ? <GClock size={16} /> : <GSignOut size={16} />}{busy === "all" ? "Signing out" : "Sign out every other device"}</button>
        )}
        {said && <span className="ac-save-state" role="status"><GCheck size={14} />{said}</span>}
      </div>
      <ul className="dv-list">
        {live.map((c) => (
          <li key={c.id} className={c.here ? "dv dv-here" : "dv"}>
            <span className="dv-g">{c.phone ? <GPhone size={22} /> : <GDevice size={22} />}</span>
            <div className="dv-who">
              <p className="dv-name">{c.device}</p>
              <p className="dv-no">{c.number}</p>
            </div>
            <ol className="dv-scans">
              <li><span>Signed in</span>{c.since}</li>
              <li><span>Last seen</span>{c.here ? "Now" : <Ago iso={c.lastSeen} />}</li>
            </ol>
            {c.here
              ? <span className="dv-stamp">You are here</span>
              : <button type="button" className="wb-ghost fm-btn dv-out" disabled={busy !== null} onClick={async () => {
                  setBusy(c.id);
                  const r = await post("/api/account/devices/sign-out", { id: c.id });
                  if (r.ok) endNow([c.id], "Signed out from this page");
                  setBusy(null);
                }}>{busy === c.id ? <GClock size={15} /> : <GSignOut size={15} />}{busy === c.id ? "Signing out" : "Sign out"}</button>}
          </li>
        ))}
      </ul>
      {ended.length > 0 && (
        <section className="bl-sec" aria-labelledby="dv-ended-h">
          <h2 id="dv-ended-h" className="bl-h2"><GClock size={18} />Ended in the last 30 days</h2>
          <ul className="dv-list dv-list-ended">
            {ended.map((c) => (
              <li key={c.id} className="dv dv-ended">
                <span className="dv-g">{c.phone ? <GPhone size={20} /> : <GDevice size={20} />}</span>
                <div className="dv-who"><p className="dv-name">{c.device}</p><p className="dv-no">{c.number}</p></div>
                <ol className="dv-scans">
                  <li><span>Signed in</span>{c.since}</li>
                  <li><span>Ended</span>{c.ended!.at}</li>
                </ol>
                <span className="dv-why">{c.ended!.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
