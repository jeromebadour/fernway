"use client";
// The owner adds staff: a Fernway user's email, support or viewer, and a fresh authenticator code. In the demo it
// only shows what it would do.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CodeCells } from "@/ui/code-cells";
import { Field } from "@/ui/field";
import { GClock, GClose, GLock, GPlus, GShield } from "@/ui/glyphs";

export function AddStaff({ demo }: { demo?: boolean }) {
  const d = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"support" | "viewer">("support");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  async function go(c = code) {
    if (demo || c.length !== 6 || !email.includes("@")) return;
    setBusy(true); setProblem(null);
    const r = await fetch("/api/operator/staff/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role, code: c }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; problems?: string[] } | null;
    setBusy(false);
    if (r?.ok) { d.current?.close(); router.refresh(); return; }
    setCode("");
    const line = r?.problems?.[0] ?? "form: Fernway could not be reached";
    setProblem({ field: line.split(":")[0]!, text: line.replace(/^[a-z]+: /, "").replace(/^./, (x) => x.toUpperCase()) });
  }
  const roles = [
    { k: "support" as const, line: "Looks, and acts on accounts and incidents" },
    { k: "viewer" as const, line: "Looks only" },
  ];
  return (
    <>
      <button type="button" className="wb-go fm-btn" onClick={() => d.current?.showModal()}><GPlus size={16} />Add staff</button>
      <dialog ref={d} className="fm-dialog op-dialog" aria-labelledby="op-add-h" onClose={() => { setEmail(""); setCode(""); setProblem(null); }}>
        <h2 id="op-add-h">Add staff</h2>
        <p>They need a Fernway account first. The console opens for them once their two-step sign-in is on.</p>
        <div className="fm sc-ask">
          <Field kind="email" label="Their Fernway email" bad={problem?.field === "email"} error={problem?.field === "email" ? problem.text : undefined}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="sam@jeromebadour.com" spellCheck={false} autoCapitalize="none" autoFocus />
          </Field>
          <fieldset className="tm-roles">
            <legend className="fm-label">As</legend>
            {roles.map((r) => (
              <label key={r.k} className={`tm-pick${role === r.k ? " tm-picked" : ""}`}>
                <input type="radio" name="staff-role" checked={role === r.k} onChange={() => setRole(r.k)} />
                <GShield size={15} /><span><b>{r.k === "support" ? "Support" : "Viewer"}</b><em>{r.line}</em></span>
              </label>
            ))}
          </fieldset>
        </div>
        {demo ? (
          <p className="op-ro"><GShield size={16} /><span><b>Read-only demo.</b> In the real console the owner confirms with a code from their authenticator app.</span></p>
        ) : (
          <>
            <p className="op-code-k"><GLock size={14} />Code from your authenticator app</p>
            <CodeCells value={code} onChange={setCode} onFull={(c) => go(c)} bad={!!problem && problem.field !== "email"} disabled={busy} label="Authenticator code" />
            {problem && problem.field !== "email" && <p className="fm-error" role="alert">{problem.text}</p>}
          </>
        )}
        <div className="fm-dialog-do">
          {!demo && <button type="button" className="wb-go fm-btn" disabled={busy || code.length !== 6 || !email.includes("@")} onClick={() => go()}>{busy ? <GClock size={16} /> : <GPlus size={16} />}Add staff</button>}
          <button type="button" className="wb-ghost fm-btn" disabled={busy} onClick={() => d.current?.close()}><GClose size={16} />{demo ? "Close" : "Not now"}</button>
        </div>
      </dialog>
    </>
  );
}
