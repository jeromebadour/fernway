"use client";
// "What a lost lead costs you": the visitor's own numbers, nothing invented. Every field starts at an example the
// visitor is told to replace; the result is plain arithmetic shown step by step.
// Fields help as you type (Kami 2026-11-10): the unit sits in the field ($, %, a month), only what the field can hold
// gets in (digits, one decimal point where a fraction makes sense), thousands are grouped as you type, a percentage
// can't pass 100, the arrow keys step the value, and each field says in one line what to put in it.
import { useState } from "react";
import { GPrice } from "@/ui/glyphs";
import { planFor } from "@/ui/rates";

type Field = {
  key: "leads" | "lost" | "close" | "value";
  label: string;
  hint: string;
  pre?: string;
  post?: string;
  max: number;
  step: number;
  decimals: boolean;
};
const fields: readonly Field[] = [
  { key: "leads", label: "Leads a month", hint: "Forms, bookings and payments together", post: "a month", max: 1_000_000, step: 50, decimals: false },
  { key: "lost", label: "Lost in the hand-off", hint: "Your best guess; most teams can't see it", post: "%", max: 100, step: 0.5, decimals: true },
  { key: "close", label: "Leads that become customers", hint: "Out of every 100 leads", post: "%", max: 100, step: 1, decimals: true },
  { key: "value", label: "One customer is worth", hint: "What a customer pays you in total", pre: "$", max: 10_000_000, step: 100, decimals: false },
];
type Key = Field["key"];

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** What the visitor typed, kept to what the field can hold: digits, one point if allowed, capped at the field's max. */
function clean(f: Field, typed: string): string {
  let s = typed.replace(/[^\d.]/g, "");
  if (!f.decimals) s = s.replace(/\./g, "");
  const [whole = "", ...rest] = s.split(".");
  const frac = rest.join("").slice(0, 2);
  let w = whole.replace(/^0+(?=\d)/, "");
  if (w !== "" && Number(`${w}.${frac || 0}`) > f.max) return String(f.max);
  if (w === "" && s.startsWith(".")) w = "0";
  return s.includes(".") && f.decimals ? `${w}.${frac}` : w;
}
const shown = (raw: string) => {
  const [w = "", frac] = raw.split(".");
  return frac === undefined ? group(w) : `${group(w)}.${frac}`;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
// Whole numbers as they are; fractions with enough decimals that a small one never reads as 0.
const num = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-US") : n < 1 ? String(Number(n.toPrecision(2))) : Number(n.toFixed(2)).toLocaleString("en-US");

const examples: Record<Key, string> = { leads: "400", lost: "3", close: "20", value: "1200" };

export function LostLeadCalculator() {
  const [v, setV] = useState<Record<Key, string>>(examples);
  const n = (k: Key) => Number(v[k]);
  // A field left empty: say which, instead of working it out from a guess.
  const missing = fields.filter((f) => v[f.key] === "");
  const lostLeads = (n("leads") * n("lost")) / 100;
  const lostCustomers = (lostLeads * n("close")) / 100;
  const lostMoney = lostCustomers * n("value");
  const plan = planFor(n("leads"));
  const over = n("leads") > plan.leads;

  const step = (f: Field, dir: 1 | -1) => {
    const next = Math.min(Math.max((Number(v[f.key]) || 0) + dir * f.step, 0), f.max);
    setV({ ...v, [f.key]: String(Number(next.toFixed(2))) });
  };

  return (
    <div className="pr-calc">
      <form className="pr-calc-in" onSubmit={(e) => e.preventDefault()}>
        <p className="pr-calc-note">Example numbers. Put in your own.</p>
        {fields.map((f) => (
          <label key={f.key}>
            <span className="pr-label">{f.label}<small>{f.hint}</small></span>
            <span className={`pr-field${f.pre ? " pr-field-pre" : ""}`}>
              {f.pre && <i>{f.pre}</i>}
              <input
                type="text" inputMode={f.decimals ? "decimal" : "numeric"} autoComplete="off"
                placeholder={`e.g. ${shown(examples[f.key])}`}
                value={shown(v[f.key])}
                onChange={(e) => setV({ ...v, [f.key]: clean(f, e.target.value) })}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); step(f, e.key === "ArrowUp" ? 1 : -1); }
                }}
              />
              {f.post && <i className={f.post === "%" ? "" : "pr-unit-word"}>{f.post}</i>}
            </span>
          </label>
        ))}
      </form>
      <div className="pr-calc-out" aria-live="polite">
        {missing.length > 0 ? (
          <p className="pr-calc-missing">Put a number in {missing.map((f) => f.label.toLowerCase()).join(" and ")}.</p>
        ) : (<>
          <ol>
            <li><span>Leads lost a month</span><b>{num(lostLeads)}</b><em>{num(n("leads"))} × {num(n("lost"))}%</em></li>
            <li><span>Customers lost a month</span><b>{num(lostCustomers)}</b><em>{num(lostLeads)} × {num(n("close"))}%</em></li>
            <li className="pr-calc-total"><span>Lost a month</span><b>{money(lostMoney)}</b><em>{num(lostCustomers)} × {money(n("value"))}</em></li>
          </ol>
          <p className="pr-calc-plan">
            <GPrice size={16} />
            <span>
              {over
                ? <>That&rsquo;s more than {plan.plan} covers ({plan.leads.toLocaleString("en-US")} a month). Every lead still goes through; talk to us about a larger plan.</>
                : <>{num(n("leads"))} {n("leads") === 1 ? "lead a month fits" : "leads a month fit"} <b>{plan.plan}</b>, ${plan.price} a month.</>}
            </span>
          </p>
        </>)}
      </div>
    </div>
  );
}
