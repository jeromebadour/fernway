"use client";
// Signing out of this device is small and shown done at once, so it needs no dialog (BUILD-RULES 2.20); the next page
// says it happened (2.21).
import { useState } from "react";
import { GClock, GSignOut } from "@/ui/glyphs";

export function SignOut() {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="ac-out" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await fetch("/api/account/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then((x) => x.json()).catch(() => null) as { next?: string } | null;
      window.location.assign(r?.next ?? "/sign-in?done=signed-out");
    }}>{busy ? <GClock size={15} /> : <GSignOut size={15} />}{busy ? "Signing out" : "Sign out"}</button>
  );
}
