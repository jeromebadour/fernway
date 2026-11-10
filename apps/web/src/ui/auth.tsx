"use client";
// Sign up and sign in, on the shared field (ui/field.tsx): a glyph in every box, email typos caught as you type, the
// company offered from a work address, Caps Lock flagged, the password shown on demand and measured as you type.
// Posts to the account API; each problem lands under its own field, and the form says what it is doing meanwhile.
import Link from "next/link";
import { useEffect, useState } from "react";
import { CodeCells } from "./code-cells";
import { CapsOn, Field } from "./field";
import { companyFromEmail, emailTypo } from "./field-help";
import { GClock, GEye, GEyeOff, GLock, GNote, GSignIn, GSignUp } from "./glyphs";

type Mode = "up" | "in";
export const strength = (p: string) => {
  if (!p) return null;
  if (p.length < 10) return { n: 1, word: `${10 - p.length} more to go` };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 14 && kinds >= 3) return { n: 4, word: "Strong" };
  if (kinds >= 3 || p.length >= 14) return { n: 3, word: "Good" };
  return { n: 2, word: "Fair: add numbers or symbols" };
};

type Problems = Partial<Record<"email" | "name" | "company" | "password" | "form", string>>;
const byField = (problems: string[]): Problems => {
  const out: Problems = {};
  for (const p of problems) {
    const m = p.match(/^(email|name|company|password|form): (.*)$/);
    const k = (m?.[1] ?? "form") as keyof Problems;
    const msg = m?.[2] ?? p;
    // "your name", "a real email address", "10 characters or more" say what's missing; anything else reads as it is.
    out[k] = /^(a |an |your |\d)/.test(msg) ? `Needs ${msg}.` : `${msg.charAt(0).toUpperCase()}${msg.slice(1)}${/[.?!]$/.test(msg) ? "" : "."}`;
  }
  return out;
};

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const [v, setV] = useState({ name: "", company: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Problems>({});
  const [ticket, setTicket] = useState<{ value: string; until: number } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = mode === "up" ? { ...v, timeZone } : { email: v.email, password: v.password, next };
    try {
      const res = await fetch(`/api/account/${mode === "up" ? "sign-up" : "sign-in"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; next?: string; twoStep?: boolean; ticket?: string; problems?: string[] };
      if (json.ok && json.twoStep && json.ticket) { setTicket({ value: json.ticket, until: Date.now() + 5 * 60_000 }); setBusy(false); return; }
      if (json.ok && json.next) { window.location.assign(json.next); return; }
      setErrors(byField(json.problems ?? ["form: something went wrong; try again"]));
    } catch {
      setErrors({ form: "Fernway could not be reached. Check your connection and try again." });
    }
    setBusy(false);
  }
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const s = mode === "up" ? strength(v.password) : null;
  const typo = emailTypo(v.email);
  const company = mode === "up" && !v.company ? companyFromEmail(v.email) : null;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));

  const password = (
    <Field kind="password" label="Password" half={mode === "up"} bad={!!errors.password} error={errors.password}
      aside={mode === "in" ? <Link className="au-forgot" href="/reset">Forgot it</Link> : undefined}
      after={<CapsOn on={caps} />}>
      <input type={show ? "text" : "password"} value={v.password} onChange={set("password")} onKeyUp={capsFrom} onKeyDown={capsFrom}
        autoComplete={mode === "up" ? "new-password" : "current-password"} placeholder={mode === "up" ? "10 characters or more" : ""} maxLength={200} />
      <button type="button" className="au-show" onClick={() => setShow(!show)} aria-label={show ? "Hide the password" : "Show the password"}>
        {show ? <GEyeOff size={16} /> : <GEye size={16} />}{show ? "Hide" : "Show"}
      </button>
    </Field>
  );

  if (ticket) return <SecondStep ticket={ticket.value} until={ticket.until} email={v.email} again={() => { setTicket(null); setV({ ...v, password: "" }); }} />;

  return (
    <form className="fm au-form" onSubmit={send} noValidate>
      <div className="fm-fields">
        <Field kind="email" label="Work email" bad={!!errors.email} error={errors.email} suggest={typo ? { text: <>Did you mean <b>{typo}</b>?</>, apply: () => setV({ ...v, email: typo }) } : null}>
          <input type="email" inputMode="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value.replace(/\s/g, "") })}
            autoComplete="email" placeholder="lena@northpine.dental" maxLength={200} autoFocus />
        </Field>
        {mode === "up" && (
          <>
            <Field kind="name" label="Your name" half bad={!!errors.name} error={errors.name}>
              <input value={v.name} onChange={set("name")} autoComplete="name" placeholder="Lena Hartmann" maxLength={80} />
            </Field>
            <Field kind="company" label="Company" half bad={!!errors.company} error={errors.company}
              suggest={company ? { text: <>From your email: <b>{company}</b></>, apply: () => setV({ ...v, company }) } : null}>
              <input value={v.company} onChange={set("company")} autoComplete="organization" placeholder="Northpine Dental" maxLength={120} />
            </Field>
          </>
        )}
        {password}
        {s && (
          <div className="fm-field fm-half au-meter-cell">
            <span className="fm-label">Strength</span>
            <span className="au-meter" aria-live="polite">
              <span className="au-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= s.n ? `au-on au-${s.n}` : ""} />)}</span>
              <span className={`au-word au-${s.n}`}>{s.word}</span>
            </span>
          </div>
        )}
      </div>
      {errors.form && <p className="fm-error fm-error-form" role="alert">{errors.form}</p>}
      {busy && <p className="au-busy" role="status"><GClock size={15} />{mode === "up" ? "Making your account" : "Signing in"}</p>}
      {mode === "up" ? (
        <>
          <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={busy}><GSignUp size={18} />Start the 14-day trial</button>
          <p className="fm-note">No card for the trial. Starting it accepts the <Link href="/terms">Terms</Link>; what Fernway keeps about you is in <Link href="/privacy">Privacy</Link>.</p>
        </>
      ) : (
        <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={busy}><GSignIn size={18} />Sign in</button>
      )}
    </form>
  );
}

// The second step: the app's 6 digits (sent on the sixth), or a recovery code. The ticket from the password step lasts
// five minutes, shown running down; when it runs out the form says so and goes back to the password.
function SecondStep({ ticket, until, email, again }: { ticket: string; until: number; email: string; again: () => void }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [left, setLeft] = useState(() => Math.max(0, Math.round((until - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [until]);

  async function send(given: string) {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/account/sign-in/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, code: given }) })
      .then((r) => r.json()).catch(() => null) as { ok?: boolean; next?: string; expired?: boolean; problems?: string[] } | null;
    if (res?.ok && res.next) { window.location.assign(res.next); return; }
    if (res?.expired) { again(); return; }
    setProblem((res?.problems?.[0] ?? "code: Fernway could not be reached; try again").replace(/^[a-z]+: /, ""));
    setCode("");
    setBusy(false);
  }
  const out = left === 0;
  const fmtRecovery = (v: string) => { const c = v.toLowerCase().replace(/[^a-z2-7]/g, "").slice(0, 10); return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c; };

  return (
    <form className="fm au-form au-two" noValidate onSubmit={(e) => { e.preventDefault(); void send(useRecovery ? recovery : code); }}>
      <p className="au-two-who"><GLock size={16} />Second step for <b>{email}</b></p>
      {!useRecovery ? (
        <div className="fm-field">
          <span className="fm-label">The 6 digits your authenticator app shows for Fernway</span>
          <CodeCells value={code} onChange={setCode} onFull={(c) => void send(c)} bad={!!problem} disabled={busy || out} label="Code from the app" />
        </div>
      ) : (
        <Field kind="password" label="A recovery code" bad={!!problem} hint="One of the ten codes saved when two-step was turned on. Each works once.">
          <input value={recovery} onChange={(e) => setRecovery(fmtRecovery(e.target.value))} placeholder="k4m2q-7xa3d" autoComplete="off" spellCheck={false} autoFocus />
        </Field>
      )}
      {problem && <p className="fm-error fm-error-form" role="alert">{problem}</p>}
      <p className={out ? "au-ticket au-ticket-out" : "au-ticket"} aria-live="polite">
        <GClock size={14} />{out ? "Five minutes have passed." : `This step stays open for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      </p>
      {busy && <p className="au-busy" role="status"><GClock size={15} />Checking the code</p>}
      <div className="au-two-do">
        {out
          ? <button type="button" className="wb-go wb-go-lg fm-btn" onClick={again}><GSignIn size={18} />Sign in again</button>
          : <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={busy || (useRecovery ? recovery.length !== 11 : code.length !== 6)}><GSignIn size={18} />Sign in</button>}
        <button type="button" className="au-switch" onClick={() => { setUseRecovery(!useRecovery); setProblem(null); }}>
          {useRecovery ? <><GLock size={15} />Use the app instead</> : <><GNote size={15} />Use a recovery code</>}
        </button>
      </div>
    </form>
  );
}
