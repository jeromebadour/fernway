"use client";
// Find a lead again: the waybill number and the email it was sent with. The number field types like a waybill:
// "FW" is already there, only digits go in, and the spaces appear by themselves (FW 26 00017).
import { Field } from "@/ui/field";
import { emailTypo } from "@/ui/field-help";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GScan } from "@/ui/glyphs";

const shape = (typed: string) => {
  const d = typed.toUpperCase().replace(/^FW/, "").replace(/\D/g, "").slice(0, 7);
  return d.length <= 2 ? d : `${d.slice(0, 2)} ${d.slice(2)}`;
};

export function FindWaybill() {
  const router = useRouter();
  const [num, setNum] = useState("");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const complete = /^\d{2} \d{5}$/.test(num);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || !email.trim()) {
      setProblem(!complete ? "A waybill number has 7 digits, like FW 26 00017." : "Needs the email you sent it with.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const r = await fetch("/api/track/find", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: `FW ${num}`, email }),
      });
      const j = await r.json();
      if (j.ok) router.push(j.track);
      else setProblem(j.problem);
    } catch {
      setProblem("Couldn't reach Fernway. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const typo = emailTypo(email);
  return (
    <form className="fm tr-find" onSubmit={find} noValidate>
      <div className="fm-fields">
        <Field kind="waybill" label="Waybill number" bad={!!problem && !complete} hint="On your receipt, and in the address of its page">
          <i>FW</i>
          <input name="number" inputMode="numeric" autoComplete="off" placeholder="26 00017" value={num}
            onChange={(e) => { setNum(shape(e.target.value)); setProblem(null); }} className="tr-num" />
        </Field>
        <Field kind="email" label="Email you sent it with"
          suggest={typo ? { text: <>Did you mean <b>{typo}</b>?</>, apply: () => setEmail(typo) } : null}>
          <input name="email" type="email" inputMode="email" autoComplete="email" placeholder="e.g. lena@northpine.com" value={email}
            onChange={(e) => { setEmail(e.target.value.replace(/\s/g, "")); setProblem(null); }} />
        </Field>
      </div>
      {problem && <p className="fm-error fm-error-form">{problem}</p>}
      <button className="wb-go wb-go-lg fm-send" type="submit" disabled={busy}><GScan />{busy ? "Looking…" : "Find my waybill"}</button>
    </form>
  );
}
