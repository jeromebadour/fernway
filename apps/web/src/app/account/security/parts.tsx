"use client";
// The password card and the two-step card. Turning two-step on is three steps in one dialog (scan, prove, keep the
// recovery codes); the codes come as a tear-off strip of ten tickets, each crossed out once copied or downloaded.
import { useRef, useState } from "react";
import { Ago } from "@/ui/ago";
import { strength } from "@/ui/auth";
import { CodeCells } from "@/ui/code-cells";
import { CapsOn, Field } from "@/ui/field";
import { GCheck, GClock, GClose, GCopy, GDown, GEye, GEyeOff, GHold, GLock, GNote, GRoute, GShield } from "@/ui/glyphs";

type Answer = { ok?: boolean; problems?: string[]; signedOut?: number; recovery?: string[]; secret?: string; qr?: string };
const post = (path: string, body: object) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json()).catch(() => ({ ok: false, problems: ["form: Fernway could not be reached; try again"] })) as Promise<Answer>;
const say = (a: Answer) => (a.problems?.[0] ?? "form: something went wrong").replace(/^[a-z-]+: /, "").replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------------------------------------------
export function PasswordCard({ changed, email }: { changed: string; email: string }) {
  const [v, setV] = useState({ current: "", next: "" });
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [state, setState] = useState<{ k: "idle" | "busy" | "done" | "bad"; text?: string; field?: "current" | "next" }>({ k: "idle" });
  const [when, setWhen] = useState(changed);
  const s = strength(v.next);
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ k: "busy" });
    const r = await post("/api/account/password", v);
    if (r.ok) {
      setV({ current: "", next: "" }); setWhen(new Date().toISOString());
      setState({ k: "done", text: r.signedOut ? `Changed. ${r.signedOut} other ${r.signedOut === 1 ? "device was" : "devices were"} signed out.` : "Changed. No other device was signed in." });
      return;
    }
    const field = r.problems?.[0]?.startsWith("next") ? "next" : "current";
    setState({ k: "bad", text: say(r), field });
  }
  return (
    <section className="sc-card" aria-labelledby="sc-pw-h">
      <div className="sc-head">
        <h2 id="sc-pw-h" className="bl-h2"><GLock size={18} />Password</h2>
        <p className="sc-fact">Last changed <Ago iso={when} /></p>
      </div>
      <form className="fm sc-form" onSubmit={save} noValidate>
        <input type="email" value={email} autoComplete="username" readOnly hidden />
        <div className="fm-fields">
          <Field kind="password" label="Current password" half bad={state.field === "current"} error={state.field === "current" ? state.text : undefined} after={<CapsOn on={caps} />}>
            <input type={show ? "text" : "password"} value={v.current} onChange={(e) => { setV({ ...v, current: e.target.value }); setState({ k: "idle" }); }}
              onKeyUp={capsFrom} autoComplete="current-password" maxLength={200} />
          </Field>
          <Field kind="password" label="New password" half bad={state.field === "next"} error={state.field === "next" ? state.text : undefined}
            hint={s ? <span className="au-meter sc-meter"><span className="au-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= s.n ? `au-on au-${s.n}` : ""} />)}</span><span className={`au-word au-${s.n}`}>{s.word}</span></span> : "10 characters or more."}>
            <input type={show ? "text" : "password"} value={v.next} onChange={(e) => { setV({ ...v, next: e.target.value }); setState({ k: "idle" }); }}
              onKeyUp={capsFrom} autoComplete="new-password" maxLength={200} />
            <button type="button" className="au-show" onClick={() => setShow(!show)} aria-label={show ? "Hide the passwords" : "Show the passwords"}>
              {show ? <GEyeOff size={16} /> : <GEye size={16} />}{show ? "Hide" : "Show"}
            </button>
          </Field>
        </div>
        <div className="ac-save">
          <button type="submit" className="wb-go fm-btn" disabled={!v.current || v.next.length < 10 || state.k === "busy"}><GLock size={16} />Change password</button>
          <span className="ac-save-state" role="status">
            {state.k === "busy" && <><GClock size={14} />Changing</>}
            {state.k === "done" && <><GCheck size={14} />{state.text}</>}
            {state.k === "idle" && <>Every other device signs out; this one stays.</>}
          </span>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function TwoStepCard({ on: onSince, left: leftFirst, email }: { on: string | null; left: number; email: string }) {
  const [on, setOn] = useState(onSince);
  const [left, setLeft] = useState(leftFirst);
  const setup = useRef<HTMLDialogElement>(null);
  const ask = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState<"off" | "codes" | null>(null);
  const [fresh, setFresh] = useState<string[] | null>(null);

  return (
    <section className={on ? "sc-card sc-on" : "sc-card"} aria-labelledby="sc-2-h">
      <div className="sc-head">
        <h2 id="sc-2-h" className="bl-h2"><GShield size={18} />Two-step sign-in</h2>
        <p className={on ? "bl-chip bl-chip-ok sc-chip" : "bl-chip bl-chip-in sc-chip"}>{on ? <><GCheck size={13} />On since {on}</> : "Off"}</p>
      </div>
      {on ? (
        <>
          <p className="sc-line">Signing in takes your password and the 6 digits from your authenticator app. Lost the phone? One recovery code signs you in instead.</p>
          <div className="sc-tickets-left" aria-label={`${left} of 10 recovery codes left`}>
            {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < left ? "sc-t-live" : "sc-t-spent"} />)}
            <span><b>{left}</b> of 10 recovery codes left</span>
          </div>
          {fresh && <Tickets codes={fresh} email={email} />}
          <div className="sc-do">
            <button type="button" className="wb-ghost fm-btn" onClick={() => { setAsking("codes"); requestAnimationFrame(() => ask.current?.showModal()); }}><GNote size={16} />New recovery codes</button>
            <button type="button" className="wb-ghost fm-btn ac-stop" onClick={() => { setAsking("off"); requestAnimationFrame(() => ask.current?.showModal()); }}><GClose size={16} />Turn off</button>
          </div>
        </>
      ) : (
        <>
          <p className="sc-line">Your password, then a code from an app on your phone (Google Authenticator, 1Password, Authy or any other). Someone with only your password gets nowhere.</p>
          <div className="sc-do">
            <button type="button" className="wb-go fm-btn" onClick={() => requestAnimationFrame(() => setup.current?.showModal())}><GShield size={16} />Turn on</button>
          </div>
        </>
      )}
      <SetupDialog ref={setup} email={email} done={(codes) => { setOn("today"); setLeft(10); setFresh(null); return codes; }} />
      <PasswordDialog ref={ask} what={asking} done={(r) => {
        if (asking === "off") { setOn(null); setFresh(null); }
        if (asking === "codes" && r.recovery) { setFresh(r.recovery); setLeft(10); }
        ask.current?.close();
      }} />
    </section>
  );
}

// Scan, prove, keep: one dialog, three steps, each numbered like a scan.
function SetupDialog({ ref, email, done }: { ref: React.RefObject<HTMLDialogElement | null>; email: string; done: (codes: string[]) => void }) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [key, setKey] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [kept, setKept] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setBusy(true); setProblem(null);
    const r = await post("/api/account/two-step/begin", {});
    setBusy(false);
    if (r.ok && r.qr && r.secret) { setKey({ qr: r.qr, secret: r.secret }); setStep(1); } else setProblem(say(r));
  }
  async function prove(c: string) {
    setBusy(true); setProblem(null);
    const r = await post("/api/account/two-step/confirm", { code: c });
    setBusy(false);
    if (r.ok && r.recovery) { setCodes(r.recovery); setStep(3); done(r.recovery); } else { setProblem(say(r)); setCode(""); }
  }
  const close = () => { ref.current?.close(); };

  return (
    <dialog ref={ref} className="fm-dialog sc-dialog" aria-labelledby="sc-setup-h" onClose={() => { if (step === 3) window.location.reload(); setStep(0); setKey(null); setCode(""); setProblem(null); setKept(false); }}>
      <h2 id="sc-setup-h">Turn on two-step sign-in</h2>
      <ol className="sc-steps">
        {["Add Fernway to the app", "Type its code", "Keep the recovery codes"].map((t, i) => (
          <li key={t} className={step > i + 1 || (step === 3 && i === 2) ? "sc-s-done" : step === i + 1 || (step === 0 && i === 0) ? "sc-s-now" : ""}>
            <span>{step > i + 1 ? <GCheck size={13} /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <>
          <p>Open your authenticator app on your phone. Fernway shows a QR code for it to scan; the app then makes a new 6-digit code every 30 seconds.</p>
          {problem && <p className="fm-error" role="alert">{problem}</p>}
          <div className="fm-dialog-do">
            <button type="button" className="wb-go fm-btn" disabled={busy} onClick={start}>{busy ? <GClock size={16} /> : <GRoute size={16} />}{busy ? "Making the code" : "Show the QR code"}</button>
            <button type="button" className="wb-ghost fm-btn" onClick={close}><GClose size={16} />Not now</button>
          </div>
        </>
      )}
      {(step === 1 || step === 2) && key && (
        <>
          <div className="sc-qr-label">
            <div className="sc-qr" dangerouslySetInnerHTML={{ __html: key.qr }} />
            <div className="sc-qr-side">
              <p className="sc-qr-for">Fernway<br /><b>{email}</b></p>
              <p className="sc-qr-cant">Can&apos;t scan? Type this key in the app:</p>
              <p className="sc-key">{key.secret}</p>
              <button type="button" className="sc-copy" onClick={async () => { await navigator.clipboard.writeText(key.secret.replace(/\s/g, "")); setCopied(true); }}>
                {copied ? <GCheck size={14} /> : <GCopy size={14} />}{copied ? "Copied" : "Copy the key"}
              </button>
            </div>
          </div>
          <div className="fm-field sc-prove">
            <span className="fm-label">The 6 digits the app shows now</span>
            <CodeCells value={code} onChange={(c) => { setCode(c); if (step === 1 && c) setStep(2); }} onFull={prove} bad={!!problem} disabled={busy} label="Code from the app" />
          </div>
          {problem && <p className="fm-error" role="alert">{problem}</p>}
          {busy && <p className="au-busy" role="status"><GClock size={15} />Checking the code</p>}
        </>
      )}
      {step === 3 && (
        <>
          <p>Two-step sign-in is on, and every other device was signed out. If the phone is ever lost, one of these codes signs you in instead of the app; each works once. They are shown only now.</p>
          <Tickets codes={codes} email={email} onKept={() => setKept(true)} />
          <div className="fm-dialog-do">
            <button type="button" className="wb-go fm-btn" disabled={!kept} onClick={close}><GCheck size={16} />{kept ? "Done" : "Copy or download them first"}</button>
          </div>
        </>
      )}
    </dialog>
  );
}

// Ten recovery codes as a tear-off strip of tickets, each with its number; copying or downloading marks them kept.
function Tickets({ codes, email, onKept }: { codes: string[]; email: string; onKept?: () => void }) {
  const [kept, setKept] = useState<"copied" | "downloaded" | null>(null);
  const text = `Fernway recovery codes for ${email}\nEach works once, in place of the authenticator app's code.\n\n${codes.map((c, i) => `${String(i + 1).padStart(2, "0")}  ${c}`).join("\n")}\n`;
  const mark = (k: "copied" | "downloaded") => { setKept(k); onKept?.(); };
  return (
    <div className="sc-strip-wrap">
      <ol className="sc-strip">
        {codes.map((c, i) => <li key={c}><span>{String(i + 1).padStart(2, "0")}</span><code>{c}</code></li>)}
      </ol>
      <div className="sc-strip-do">
        <button type="button" className="sc-copy" onClick={async () => { await navigator.clipboard.writeText(text); mark("copied"); }}><GCopy size={14} />Copy all</button>
        <a className="sc-copy" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="fernway-recovery-codes.txt" onClick={() => mark("downloaded")}><GDown size={14} />Download .txt</a>
        {kept && <span className="ac-save-state"><GCheck size={14} />{kept === "copied" ? "Copied" : "Downloaded"}</span>}
      </div>
    </div>
  );
}

// The password before turning two-step off or making new recovery codes.
function PasswordDialog({ ref, what, done }: { ref: React.RefObject<HTMLDialogElement | null>; what: "off" | "codes" | null; done: (r: Answer) => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setProblem(null);
    const r = await post(what === "off" ? "/api/account/two-step/off" : "/api/account/two-step/recovery", { password: pw });
    setBusy(false);
    if (r.ok) { setPw(""); done(r); } else setProblem(say(r));
  }
  return (
    <dialog ref={ref} className="fm-dialog" aria-labelledby="sc-ask-h" onClose={() => { setPw(""); setProblem(null); }}>
      <form onSubmit={go} noValidate>
        <h2 id="sc-ask-h">{what === "off" ? "Turn off two-step sign-in?" : "Make new recovery codes?"}</h2>
        <p>{what === "off"
          ? "Your password alone will sign in again, and every other device signs out now. The recovery codes stop working."
          : "The ten new codes replace every old one at once; the old ones stop working."}</p>
        <div className="fm sc-ask">
          <Field kind="password" label="Your password" bad={!!problem} error={problem ?? undefined}>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus maxLength={200} />
          </Field>
        </div>
        <div className="fm-dialog-do">
          <button type="submit" className={what === "off" ? "wb-ghost fm-btn ac-stop sc-stop-go" : "wb-go fm-btn"} disabled={!pw || busy}>
            {busy ? <GClock size={16} /> : what === "off" ? <GHold size={16} /> : <GNote size={16} />}{busy ? "Checking" : what === "off" ? "Turn off" : "Make new codes"}
          </button>
          <button type="button" className="wb-ghost fm-btn" onClick={() => ref.current?.close()}><GClose size={16} />Keep as it is</button>
        </div>
      </form>
    </dialog>
  );
}
