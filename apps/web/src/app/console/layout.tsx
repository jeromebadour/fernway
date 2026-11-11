import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import "@/ui/console.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { requirePerson } from "@/lib/session";
import { GMark, GUser } from "@/ui/glyphs";
import { Notice } from "@/ui/notice";
import { SignOut } from "../account/sign-out";
import { ConsoleNav } from "./nav";

// The console's frame: the account area's own top bar, labelled Console, with the way to the account; its sections
// down the left.
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  accountsOrNotFound();
  const m = await requirePerson("/console");
  const initials = m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="wb ac cn">
      <header className="ac-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <span className="ac-where">Console</span>
        <span className="cn-acc">{m.accountName}<em>AC {String(m.accountId).padStart(6, "0")}</em></span>
        <div className="ac-me">
          <Link className="cn-to" href="/account"><GUser size={15} />Account</Link>
          <span className="wb-ava ac-ava">{initials}</span>
          <span className="ac-me-who"><b>{m.name}</b><em>{m.accountName} · {m.role.charAt(0).toUpperCase() + m.role.slice(1)}</em></span>
          <SignOut />
        </div>
      </header>
      <div className="ac-body">
        <ConsoleNav />
        <main className="ac-main cn-main"><Suspense><Notice /></Suspense>{children}</main>
      </div>
    </div>
  );
}
