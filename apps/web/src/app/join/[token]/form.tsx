"use client";
// Joining through an invite: a name and a password. The email is the invited one, already proven by the link.
import { useState } from "react";
import { CapsOn, Field } from "@/ui/field";
import { GClock, GEye, GEyeOff, GSignUp } from "@/ui/glyphs";

type Answer = { ok?: boolean; next?: string; problems?: string[] };
const clean = (p: string) => p.replace(/^[a-zA-Z]+: /, "").replace(/^./, (c) => c.toUpperCase());

export function JoinForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  return (
    <form className="fm au-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setProblems({});
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, name, password: pw, timeZone }) })
        .then((x) => x.json() as Promise<Answer>).catch((): Answer => ({ ok: false, problems: ["form: Fernway could not be reached"] }));
      if (r.ok && r.next) { window.location.assign(r.next); return; }
      const p: Record<string, string> = {};
      for (const line of r.problems ?? ["form: something went wrong"]) p[line.split(":")[0]!] ??= clean(line);
      setProblems(p); setBusy(false);
    }}>
      <div className="fm-fields">
        <Field kind="name" label="Your name" bad={!!problems.name} error={problems.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" autoFocus />
        </Field>
        <Field kind="password" label="Password" bad={!!problems.password} error={problems.password} hint={!problems.password ? "10 characters or more" : undefined} after={<CapsOn on={caps} />}>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={pw} maxLength={200} onKeyUp={capsFrom} onKeyDown={capsFrom} onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="au-show" onClick={() => setShow(!show)} aria-label={show ? "Hide the password" : "Show the password"}>
            {show ? <GEyeOff size={16} /> : <GEye size={16} />}{show ? "Hide" : "Show"}
          </button>
        </Field>
      </div>
      {problems.form && <p className="fm-error" role="alert">{problems.form}</p>}
      {busy && <p className="au-busy" role="status"><GClock size={15} />Joining</p>}
      <button type="submit" className="wb-go wb-go-lg fm-btn fm-send" disabled={busy || !name.trim() || pw.length < 10}><GSignUp size={18} />Join the team</button>
    </form>
  );
}
