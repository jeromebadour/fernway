import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DemoMode } from "@/ui/demo-mode";
import type { PlanNote } from "@fernway/delivery";
import { GCard, GHold, GMark, GShield, GUser } from "@/ui/glyphs";
import { Notice } from "@/ui/notice";
import { SignOut } from "../../account/sign-out";
import { ConsoleNav } from "../nav";

// The console's frame: the account area's own top bar, labelled Console, with the account name and AC number and the
// way to the account; its sections down the left. The public demo wears it with a "Read-only demo" band.
export function ConsoleFrame({ who, demo, plan, children }: {
  who: { name: string; accountName: string; accountId: number; role: string }; demo?: boolean; plan?: PlanNote | null; children: ReactNode;
}) {
  const initials = who.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const body = (
    <div className="wb ac cn">
      {demo && (
        <p className="op-demo"><GShield size={15} /><b>Read-only demo.</b> An invented clinic&apos;s console with invented leads; every action only shows what it would do. <Link href="/demo/operator">Fernway&apos;s own console</Link><Link href="/">Back to Fernway</Link></p>
      )}
      <header className="ac-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <span className="ac-where">Console</span>
        <span className="cn-acc">{who.accountName}<em>AC {String(who.accountId).padStart(6, "0")}</em></span>
        <div className="ac-me">
          {!demo && <Link className="cn-to" href="/account"><GUser size={15} />Account</Link>}
          <span className="wb-ava ac-ava">{initials}</span>
          <span className="ac-me-who"><b>{who.name}</b><em>{who.accountName} · {who.role.charAt(0).toUpperCase() + who.role.slice(1)}</em></span>
          {!demo && <SignOut />}
        </div>
      </header>
      <div className="ac-body">
        <ConsoleNav />
        <main className="ac-main cn-main">{!demo && <Suspense><Notice /></Suspense>}{plan && <PlanBar note={plan} />}{children}</main>
      </div>
    </div>
  );
  return demo ? <DemoMode>{body}</DemoMode> : body;
}

// The plan, when it needs the owner: a trial over with no plan, or a month past the plan's leads. Leads are delivered
// either way; this only asks for the plan that fits. Stays until it is settled, so it has no close button.
function PlanBar({ note }: { note: PlanNote }) {
  const title = note.kind === "ended" ? "Your trial has ended" : `This month: ${note.used.toLocaleString("en-US")} leads signed for, on a plan for ${note.leads.toLocaleString("en-US")}`;
  const line = note.kind === "ended"
    ? "Forms, the embed and WordPress keep delivering. Bookings, the API, webhooks out and Sheets wait, as you left them, until you pick a plan."
    : "Every lead is still delivered. Move up for next month, so the plan fits what you send.";
  return (
    <div className="nt nt-hz" role="status">
      <GHold size={18} />
      <div><p className="nt-title">{title}</p><p className="nt-line">{line}</p></div>
      <Link className="wb-ghost fm-btn" href="/account/billing"><GCard size={16} />Plan and billing</Link>
    </div>
  );
}
