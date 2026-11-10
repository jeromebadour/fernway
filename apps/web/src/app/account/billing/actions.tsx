"use client";
// The two ways out to Stripe: Checkout for a new plan, the portal for the card, invoices, a switch or a cancel. Each
// says it is working while Stripe opens its page, and says what went wrong if it can't.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GCard, GClock, GHold, GRoute } from "@/ui/glyphs";

async function open(path: string, body: object, set: (s: { busy: boolean; problem: string | null }) => void) {
  set({ busy: true, problem: null });
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((x) => x.json()).catch(() => null) as { ok?: boolean; url?: string; problems?: string[] } | null;
  if (r?.ok && r.url) return window.location.assign(r.url);
  set({ busy: false, problem: r?.problems?.[0]?.replace(/^[a-z]+: /, "") ?? "Stripe could not be reached; try again in a minute" });
}

export function StartPlan({ plan, name, pick }: { plan: string; name: string; pick: boolean }) {
  const [s, set] = useState<{ busy: boolean; problem: string | null }>({ busy: false, problem: null });
  return (
    <div className="bl-act">
      <button type="button" className={pick ? "wb-go bl-btn" : "wb-ghost bl-btn"} disabled={s.busy}
        onClick={() => open("/api/account/billing/checkout", { plan }, set)}>
        {s.busy ? <GClock size={16} /> : <GRoute size={16} />}{s.busy ? "Opening Stripe" : `Start ${name}`}
      </button>
      {s.problem && <p className="bl-problem" role="alert"><GHold size={14} />{s.problem}</p>}
    </div>
  );
}

export function OpenPortal({ label = "Card, plan and invoices", ghost = false }: { label?: string; ghost?: boolean }) {
  const [s, set] = useState<{ busy: boolean; problem: string | null }>({ busy: false, problem: null });
  return (
    <div className="bl-act">
      <button type="button" className={ghost ? "wb-ghost bl-btn" : "wb-go bl-btn"} disabled={s.busy}
        onClick={() => open("/api/account/billing/portal", {}, set)}>
        {s.busy ? <GClock size={16} /> : <GCard size={16} />}{s.busy ? "Opening Stripe" : label}
      </button>
      {s.problem && <p className="bl-problem" role="alert"><GHold size={14} />{s.problem}</p>}
    </div>
  );
}

/** Back from Checkout before Stripe's webhook has landed: reads the page again every 2 s, for up to 30 s. */
export function AwaitPlan() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 15) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, 2_000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return tries >= 15
    ? <p className="bl-wait"><GHold size={14} />Stripe has not confirmed yet. Reload in a minute; the payment is safe either way.</p>
    : <p className="bl-wait"><GClock size={14} />Waiting for Stripe to confirm the payment</p>;
}
