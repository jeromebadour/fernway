"use client";
// A block of code people copy: a label, the code, and a copy button that says when it worked.
import { useState } from "react";
import { GCheck, GCopy } from "./glyphs";

export function CodeBlock({ label, code, className }: { label: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <figure className={`dc-code ${className ?? ""}`}>
      <figcaption>
        <span>{label}</span>
        <button type="button" onClick={copy} aria-live="polite">
          {copied ? <><GCheck size={14} />Copied</> : <><GCopy size={14} />Copy</>}
        </button>
      </figcaption>
      <pre tabIndex={0}><code>{code}</code></pre>
    </figure>
  );
}
