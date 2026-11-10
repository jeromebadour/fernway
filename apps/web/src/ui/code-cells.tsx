"use client";
// Six boxes for an authenticator code: each takes one digit and moves on, Backspace steps back, a pasted code fills
// them all, and the sixth digit sends it. Used by the sign-in's second step and by turning two-step on.
import { useRef } from "react";

export function CodeCells({ value, onChange, onFull, bad, disabled, label }: {
  value: string; onChange: (v: string) => void; onFull?: (v: string) => void; bad?: boolean; disabled?: boolean; label: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  const put = (v: string, focus: number) => {
    const clean = v.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    refs.current[Math.min(focus, 5)]?.focus();
    if (clean.length === 6) onFull?.(clean);
  };
  return (
    <div className={bad ? "cc cc-bad" : "cc"} role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className={d.trim() ? "cc-on" : undefined}
          value={d.trim()} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} disabled={disabled}
          aria-label={`Digit ${i + 1}`} autoFocus={i === 0}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (typed.length > 1) return put(typed, typed.length);
            // Digits stay in a row: typing past the end lands at the end.
            const at = Math.min(i, value.length);
            if (typed) put(value.slice(0, at) + typed + value.slice(at + 1), at + 1);
            else put(value.slice(0, i) + value.slice(i + 1), i);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d.trim() && i > 0) { e.preventDefault(); put(value.slice(0, i - 1), i - 1); }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => { e.preventDefault(); put(e.clipboardData.getData("text"), 6); }} />
      ))}
    </div>
  );
}
