"use client";
// The status page reads itself again every 30 s, and says how fresh what you see is.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useNow } from "@/ui/use-now";
import { GResend } from "@/ui/glyphs";
import { spellAge } from "@/ui/ago";

export function Live({ checkedAt }: { checkedAt: string }) {
  const router = useRouter();
  const now = useNow();
  // Which check is running: cleared when a newer page (a later checkedAt) arrives.
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const busy = busyFor === checkedAt;
  useEffect(() => {
    const again = setInterval(() => { setBusyFor(checkedAt); router.refresh(); }, 30_000);
    return () => clearInterval(again);
  }, [router, checkedAt]);
  return (
    <p className="st-live" role="status">
      <span className="st-pulse" aria-hidden="true" />
      {busy ? "Checking again" : now === null ? "Checked just now" : `Checked ${spellAge(now - Date.parse(checkedAt))} ago, again every 30 s`}
      <button type="button" className="st-again" onClick={() => { setBusyFor(checkedAt); router.refresh(); }} disabled={busy}><GResend size={14} />Check now</button>
    </p>
  );
}
