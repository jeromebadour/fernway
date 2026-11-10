"use client";
// Forgot the password: ask for a link (the same answer whether the email has an account or not), then set a new one.
import Link from "next/link";
import { useState } from "react";
import { CapsOn, Field } from "./field";
import { emailTypo } from "./field-help";
import { GCheck, GClock, GEye, GEyeOff, GMail, GSave, GSignIn } from "./glyphs";

type Answer = { ok?: boolean; next?: string; problems?: string[] };
async function post(path: string, body: object): Promise<Answer> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({}))) as Answer;
}
const clean = (p: string) => p.replace(/^[a-z]+: /, "").replace(/^./, (c) => c.toUpperCase());

export function AskReset() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const typo = emailTypo(email);
  if (state === "sent") {
    return (
      <div className="fm-done au-sent" role="status">
        <p className="au-sent-h"><GMail size={18} />Check your inbox</p>
        <p className="fm-done-text">If <b>{email}</b> has a Fernway account, a link to set a new password is on its way. It works once, for one hour.</p>
        <div className="fm-done-do"><Link className="wb-ghost" href="/sign-in"><GSignIn size={16} />Back to sign in</Link></div>
      </div>
    );
  }
  return (
    <form className="fm au-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setState("busy"); setError(null);
      const r = await post("/api/account/reset-request", { email }).catch((): Answer => ({ ok: false, problems: ["form: Fernway could not be reached"] }));
      if (r.ok) setState("sent"); else { setError(clean(r.problems?.[0] ?? "Something went wrong")); setState("idle"); }
    }}>
      <div className="fm-fields">
        <Field kind="email" label="The email you signed up with" error={error ?? undefined} bad={!!error}
          suggest={typo ? { text: <>Did you mean <b>{typo}</b>?</>, apply: () => setEmail(typo) } : null}>
          <input type="email" inputMode="email" autoComplete="email" value={email} maxLength={200} autoFocus placeholder="lena@northpine.dental"
            onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))} />
        </Field>
      </div>
      {state === "busy" && <p className="au-busy" role="status"><GClock size={15} />Sending the link</p>}
      <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={state === "busy"}><GMail size={18} />Send me a link</button>
    </form>
  );
}

export function NewPassword({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  return (
    <form className="fm au-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      const r = await post("/api/account/reset", { token, password: pw }).catch((): Answer => ({ ok: false, problems: ["form: Fernway could not be reached"] }));
      if (r.ok && r.next) { window.location.assign(r.next); return; }
      setError(clean(r.problems?.[0] ?? "Something went wrong")); setBusy(false);
    }}>
      <div className="fm-fields">
        <Field kind="password" label="New password" error={error ?? undefined} bad={!!error} hint={!error ? "10 characters or more. Every device is signed out once it's set." : undefined} after={<CapsOn on={caps} />}>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={pw} maxLength={200} autoFocus onKeyUp={capsFrom} onKeyDown={capsFrom}
            onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="au-show" onClick={() => setShow(!show)} aria-label={show ? "Hide the password" : "Show the password"}>
            {show ? <GEyeOff size={16} /> : <GEye size={16} />}{show ? "Hide" : "Show"}
          </button>
        </Field>
      </div>
      {busy && <p className="au-busy" role="status"><GClock size={15} />Saving the new password</p>}
      <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={busy || pw.length < 10}><GSave size={18} />Set the password</button>
      {pw.length >= 10 && !busy && <p className="au-busy au-ready"><GCheck size={15} />Long enough</p>}
    </form>
  );
}
