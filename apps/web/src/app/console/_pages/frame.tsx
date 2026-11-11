import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DemoMode } from "@/ui/demo-mode";
import { GMark, GShield, GUser } from "@/ui/glyphs";
import { Notice } from "@/ui/notice";
import { SignOut } from "../../account/sign-out";
import { ConsoleNav } from "../nav";

// The console's frame: the account area's own top bar, labelled Console, with the account name and AC number and the
// way to the account; its sections down the left. The public demo wears it with a "Read-only demo" band.
export function ConsoleFrame({ who, demo, children }: {
  who: { name: string; accountName: string; accountId: number; role: string }; demo?: boolean; children: ReactNode;
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
        <main className="ac-main cn-main">{!demo && <Suspense><Notice /></Suspense>}{children}</main>
      </div>
    </div>
  );
  return demo ? <DemoMode>{body}</DemoMode> : body;
}
