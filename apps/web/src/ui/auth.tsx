"use client";
// Sign up and sign in, on the shared field (ui/field.tsx): a glyph in every box, email typos caught as you type, the
// company offered from a work address, Caps Lock flagged, the password shown on demand and measured as you type.
// Wired to the account API in step 5's build; until then it checks the fields only.
import Link from "next/link";
import { useState } from "react";
import { CapsOn, Field } from "./field";
import { companyFromEmail, emailTypo } from "./field-help";
import { GEye, GEyeOff, GSignIn, GSignUp } from "./glyphs";

type Mode = "up" | "in";
const strength = (p: string) => {
  if (!p) return null;
  if (p.length < 10) return { n: 1, word: `${10 - p.length} more to go` };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 14 && kinds >= 3) return { n: 4, word: "Strong" };
  if (kinds >= 3 || p.length >= 14) return { n: 3, word: "Good" };
  return { n: 2, word: "Fair: add numbers or symbols" };
};

export function AuthForm({ mode }: { mode: Mode }) {
  const [v, setV] = useState({ name: "", company: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const s = mode === "up" ? strength(v.password) : null;
  const typo = emailTypo(v.email);
  const company = mode === "up" && !v.company ? companyFromEmail(v.email) : null;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));

  const password = (
    <Field kind="password" label="Password" half={mode === "up"}
      aside={mode === "in" ? <Link className="au-forgot" href="/reset">Forgot it</Link> : undefined}
      after={<CapsOn on={caps} />}>
      <input type={show ? "text" : "password"} value={v.password} onChange={set("password")} onKeyUp={capsFrom} onKeyDown={capsFrom}
        autoComplete={mode === "up" ? "new-password" : "current-password"} placeholder={mode === "up" ? "10 characters or more" : ""} maxLength={200} />
      <button type="button" className="au-show" onClick={() => setShow(!show)} aria-label={show ? "Hide the password" : "Show the password"}>
        {show ? <GEyeOff size={16} /> : <GEye size={16} />}{show ? "Hide" : "Show"}
      </button>
    </Field>
  );

  return (
    <form className="fm au-form" onSubmit={(e) => e.preventDefault()} noValidate>
      <div className="fm-fields">
        <Field kind="email" label="Work email" suggest={typo ? { text: <>Did you mean <b>{typo}</b>?</>, apply: () => setV({ ...v, email: typo }) } : null}>
          <input type="email" inputMode="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value.replace(/\s/g, "") })}
            autoComplete="email" placeholder="lena@northpine.dental" maxLength={200} autoFocus />
        </Field>
        {mode === "up" && (
          <>
            <Field kind="name" label="Your name" half>
              <input value={v.name} onChange={set("name")} autoComplete="name" placeholder="Lena Hartmann" maxLength={80} />
            </Field>
            <Field kind="company" label="Company" half
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
      {mode === "up" ? (
        <>
          <button type="submit" className="wb-go wb-go-lg fm-btn fm-send"><GSignUp size={18} />Start the 14-day trial</button>
          <p className="fm-note">No card for the trial. Starting it accepts the <Link href="/terms">Terms</Link>; what Fernway keeps about you is in <Link href="/privacy">Privacy</Link>.</p>
        </>
      ) : (
        <button type="submit" className="wb-go wb-go-lg fm-btn fm-send"><GSignIn size={18} />Sign in</button>
      )}
    </form>
  );
}
