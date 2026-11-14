"use client";
// The one field every form uses: a glyph for what the field holds (each kind its own), the label, the box, and the
// helps under it (a hint, an error, or a suggestion with a button that applies it).
import type { ReactNode } from "react";
import { GBuilding, GCalendar, GCaps, GCheck, GClock, GGlobe, GKey, GLock, GMail, GNote, GPhone, GPrice, GRoute, GScan, GSeal, GSheet, GShield, GStage, GUser } from "./glyphs";

export type FieldKind = "name" | "company" | "email" | "password" | "phone" | "website" | "message" | "waybill" | "zone" | "route" | "tags" | "stage" | "calendar" | "role" | "key" | "sheet" | "secret";
const glyphs: Record<FieldKind, (p: { size?: number }) => ReactNode> = {
  name: GUser, company: GBuilding, email: GMail, password: GLock, phone: GPhone, website: GGlobe, message: GNote, waybill: GScan, zone: GClock,
  route: GRoute, tags: GPrice, stage: GStage, calendar: GCalendar, role: GShield, key: GKey, sheet: GSheet, secret: GSeal,
};

export function Field({ kind, label, aside, half, area, bad, hint, error, suggest, children, after }: {
  kind: FieldKind; label: string; aside?: ReactNode; half?: boolean; area?: boolean; bad?: boolean; hint?: ReactNode; error?: ReactNode;
  suggest?: { text: ReactNode; apply: () => void; action?: string } | null; children: ReactNode; after?: ReactNode;
}) {
  const G = glyphs[kind];
  return (
    <label className={half ? "fm-field fm-half" : "fm-field"}>
      <span className="fm-label">{label}{aside}</span>
      <span className={`fm-input fm-has-g${area ? " fm-area" : ""}${bad ? " fm-bad" : ""}`}>
        <span className="fm-g" aria-hidden="true"><G size={16} /></span>
        {children}
      </span>
      {suggest && (
        <span className="fm-suggest" role="status">
          <span>{suggest.text}</span>
          <button type="button" onClick={(e) => { e.preventDefault(); suggest.apply(); }}><GCheck size={13} />{suggest.action ?? "Use it"}</button>
        </span>
      )}
      {(error || hint || after) && (
        <span className="fm-under">
          {error ? <span className="fm-error">{error}</span> : hint ? <span className="fm-hint">{hint}</span> : <span />}
          {after}
        </span>
      )}
    </label>
  );
}

/** Shown under a password while Caps Lock is on. */
export function CapsOn({ on }: { on: boolean }) {
  return on ? <span className="fm-caps" role="status"><GCaps size={13} />Caps Lock is on</span> : null;
}
