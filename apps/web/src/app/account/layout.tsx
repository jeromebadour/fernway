import Link from "next/link";
import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { requirePerson } from "@/lib/session";
import { Notice } from "@/ui/notice";
import { GMark } from "@/ui/glyphs";
import { Suspense } from "react";
import { SignOut } from "./sign-out";
import { AccountNav } from "./nav";

// The account area's frame: its own top bar (the signed-in person, sign out) and the sections down the left.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  accountsOrNotFound();
  const m = await requirePerson();
  const initials = m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="wb ac">
      <header className="ac-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <span className="ac-where">Account</span>
        <div className="ac-me">
          <span className="wb-ava ac-ava">{initials}</span>
          <span className="ac-me-who"><b>{m.name}</b><em>{m.accountName} · {m.role.charAt(0).toUpperCase() + m.role.slice(1)}</em></span>
          <SignOut />
        </div>
      </header>
      <div className="ac-body">
        <AccountNav />
        <main className="ac-main"><Suspense><Notice /></Suspense>{children}</main>
      </div>
    </div>
  );
}
