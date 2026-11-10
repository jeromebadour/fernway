import Link from "next/link";
import type { ReactNode } from "react";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/account.css";
import { accountsOrNotFound } from "@/lib/accounts-on";
import { me } from "@/lib/me";
import { GMark, GSignOut } from "@/ui/glyphs";
import { AccountNav } from "./nav";

// The account area's frame: its own top bar (the signed-in person, sign out) and the sections down the left.
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  accountsOrNotFound();
  const m = await me();
  const initials = m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="wb ac">
      <header className="ac-top">
        <Link className="wb-brand" href="/"><GMark /><span>FERNWAY</span></Link>
        <span className="ac-where">Account</span>
        <div className="ac-me">
          <span className="wb-ava ac-ava">{initials}</span>
          <span className="ac-me-who"><b>{m.name}</b><em>{m.company} · {m.role}</em></span>
          <button type="button" className="ac-out"><GSignOut size={15} />Sign out</button>
        </div>
      </header>
      <div className="ac-body">
        <AccountNav />
        <main className="ac-main">{children}</main>
      </div>
    </div>
  );
}
