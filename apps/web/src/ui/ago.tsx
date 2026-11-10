"use client";
// "3 min ago", kept current while the page is open; the exact time, in the viewer's own zone, on hover and for screen
// readers. Rendered empty on the server so the server's clock and zone never show.
import { useNow } from "./use-now";

export function spellAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

export function Ago({ iso }: { iso: string }) {
  const now = useNow();
  const at = new Date(iso);
  return (
    <time dateTime={iso} title={at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })}>
      {now === null ? "" : `${spellAge(now - at.getTime())} ago`}
    </time>
  );
}
