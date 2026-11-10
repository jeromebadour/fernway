// The retry clock: when each of the 8 tries goes, on a time-since-pickup scale. The tries come from the engine's own
// schedule (packages/core RETRY_WAITS_MS), so the picture can't drift from what Fernway does. Styles in site.css.
import { RETRY_WAITS_MS } from "@fernway/core";
import type { ReactNode } from "react";
import { GClock } from "./glyphs";

// Minutes after pickup: the first try at once, then each wait added to the one before.
const tries = RETRY_WAITS_MS.reduce<number[]>((at, wait) => [...at, at[at.length - 1]! + wait / 60_000], [0]);
const clockAt = (min: number) => (min === 0 ? 0 : (Math.log10(min + 1) / Math.log10(1441)) * 100);
const label = (min: number) =>
  min === 0 ? "now" : min < 1 ? `${Math.round(min * 60)} s` : min < 60 ? `${+(min < 20 ? min.toFixed(1) : Math.round(min))} min` : `${+(min / 60).toFixed(1)} h`;
const scale = [{ at: 1, label: "1 min" }, { at: 60, label: "1 h" }, { at: 1440, label: "24 h" }];
const spoken = `Tries at pickup, then ${tries.slice(1).map(label).join(", ")} after it`;

export function RetryClock({ children }: { children?: ReactNode }) {
  return (
    <figure className="wb-clock">
      <figcaption><GClock size={16} />The retry clock: {tries.length} tries over 24 hours</figcaption>
      <div className="wb-clock-bar" role="img" aria-label={spoken}>
        {tries.map((m, i) => (
          <span key={i} className="wb-tick" style={{ left: `${clockAt(m)}%` }}>
            <i>{i + 1}</i><em>{label(m)}</em>
          </span>
        ))}
      </div>
      <div className="wb-clock-scale">
        {scale.map(({ at, label: l }) => <span key={l} style={{ left: `${clockAt(at)}%` }}>{l}</span>)}
      </div>
      {children}
    </figure>
  );
}
