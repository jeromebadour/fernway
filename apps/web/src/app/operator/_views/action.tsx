"use client";
// Every operator action: a dialog that says what will happen, an optional note, and a fresh code from the
// authenticator app (each action asks again). In the public demo the same dialog only shows what it would do.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CodeCells } from "@/ui/code-cells";
import { GCalendar, GClock, GClose, GLock, GNote, GResend, GShield, GTrash, GUser } from "@/ui/glyphs";

const glyphs = { calendar: GCalendar, resend: GResend, note: GNote, user: GUser, shield: GShield, trash: GTrash };
export type OpsGlyph = keyof typeof glyphs;

export function OpsAction({ label, title, text, path, body = {}, glyph, demo, noteLabel, small, stop }: {
  label: string; title: string; text: React.ReactNode; path: string; body?: object; glyph: OpsGlyph; demo?: boolean; noteLabel?: string; small?: boolean; stop?: boolean;
}) {
  const G = glyphs[glyph];
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function go(c = code) {
    if (demo || c.length !== 6) return;
    setBusy(true); setProblem(null);
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(noteLabel ? { note } : {}), code: c }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setCode("");
    setProblem((r?.problems?.[0] ?? "form: Fernway could not be reached").replace(/^[a-z]+: /, "").replace(/^./, (x) => x.toUpperCase()));
  }
  return (
    <>
      <button type="button" className={small ? "cn-resend" : `wb-ghost fm-btn${stop ? " ac-stop" : ""}`} onClick={() => d.current?.showModal()}><G size={small ? 14 : 16} />{label}</button>
      <dialog ref={d} className="fm-dialog op-dialog" aria-label={title} onClose={() => { setCode(""); setNote(""); setProblem(null); }}>
        <h2>{title}</h2>
        <p>{text}</p>
        {demo ? (
          <p className="op-ro"><GShield size={16} /><span><b>Read-only demo.</b> In the real console this asks for the 6-digit code from the staff member&apos;s authenticator app, does it, and writes it to the operator audit log.</span></p>
        ) : (
          <>
            {noteLabel && (
              <label className="fm-field op-note"><span className="fm-label">{noteLabel}</span>
                <span className="fm-input fm-area"><textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} /></span>
              </label>
            )}
            <p className="op-code-k"><GLock size={14} />Code from your authenticator app</p>
            <CodeCells value={code} onChange={setCode} onFull={(c) => go(c)} bad={!!problem} disabled={busy} label="Authenticator code" />
            {problem && <p className="fm-error" role="alert">{problem}</p>}
          </>
        )}
        <div className="fm-dialog-do">
          {!demo && <button type="button" className={stop ? "wb-ghost fm-btn ac-stop sc-stop-go" : "wb-go fm-btn"} disabled={busy || code.length !== 6} onClick={() => go()}>{busy ? <GClock size={16} /> : <G size={16} />}{label}</button>}
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />{demo ? "Close" : "Not now"}</button>
        </div>
      </dialog>
    </>
  );
}
