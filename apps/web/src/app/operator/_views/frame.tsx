import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { GMark, GShield } from "@/ui/glyphs";
import { Notice } from "@/ui/notice";
import { SignOut } from "../../account/sign-out";
import { OpsNav } from "./nav";

// The operator console's frame: Fernway's own, labelled Operator, with the staff member and their staff role. The
// public demo wears the same frame with a "Read-only demo" band and invented staff.
export function OpsFrame({ who, demo, children }: { who: { name: string; role: string }; demo?: boolean; children: ReactNode }) {
  const base = demo ? "/demo/operator" : "/operator";
  const initials = who.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="wb ac cn op">
      {demo && (
        <p className="op-demo"><GShield size={15} /><b>Read-only demo.</b> Invented data for a Fernway that runs many accounts; nothing here is real, and every action only shows what it would do. <Link href="/">Back to Fernway</Link></p>
      )}
      <header className="ac-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <span className="ac-where op-where">Operator</span>
        <div className="ac-me">
          {!demo && <Link className="cn-to" href="/console"><GShield size={15} />Console</Link>}
          <span className="wb-ava ac-ava op-ava">{initials}</span>
          <span className="ac-me-who"><b>{who.name}</b><em>Fernway staff · {who.role.charAt(0).toUpperCase() + who.role.slice(1)}</em></span>
          {!demo && <SignOut />}
        </div>
      </header>
      <div className="ac-body">
        <OpsNav base={base} />
        <main className="ac-main cn-main op-main">{!demo && <Suspense><Notice /></Suspense>}{children}</main>
      </div>
    </div>
  );
}
