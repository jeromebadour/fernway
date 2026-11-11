"use client";
// The sync log's search: a waybill number, a name, an email, a company or a phone. Sent on Enter; Clear empties it.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GClose, GFind } from "@/ui/glyphs";

export function LogSearch({ q, state }: { q: string; state?: string }) {
  const router = useRouter();
  const [v, setV] = useState(q);
  const go = (text: string) => {
    const p = new URLSearchParams();
    if (state) p.set("state", state);
    if (text.trim()) p.set("q", text.trim());
    router.push(p.size ? `/console/log?${p}` : "/console/log");
  };
  return (
    <form className="cn-search" role="search" onSubmit={(e) => { e.preventDefault(); go(v); }}>
      <span className="fm-input fm-has-g">
        <span className="fm-g" aria-hidden="true"><GFind size={16} /></span>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="FW 26 01427, a name, an email" maxLength={120} aria-label="Find a lead" />
        {v && <button type="button" className="cn-clear" aria-label="Clear" onClick={() => { setV(""); go(""); }}><GClose size={13} /></button>}
      </span>
    </form>
  );
}
