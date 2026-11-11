"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GBuilding, GCard, GGrid, GHold, GMail, GNodes, GRoute, GShield } from "@/ui/glyphs";

const sections = [
  { href: "", label: "Overview", G: GGrid },
  { href: "/queue", label: "Queue", G: GRoute },
  { href: "/ghl", label: "GHL", G: GNodes },
  { href: "/accounts", label: "Accounts", G: GBuilding },
  { href: "/stripe", label: "Stripe", G: GCard },
  { href: "/email", label: "Email", G: GMail },
  { href: "/incidents", label: "Incidents", G: GHold },
  { href: "/staff", label: "Staff", G: GShield },
];

export function OpsNav({ base }: { base: string }) {
  const here = usePathname();
  const on = (href: string) => (href === "" ? here === base : here.startsWith(base + href));
  return (
    <nav className="ac-nav" aria-label="Operator">
      <ul>
        {sections.map(({ href, label, G }) => (
          <li key={href}><Link href={base + href} aria-current={on(href) ? "page" : undefined}><G size={16} />{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
