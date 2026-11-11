"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GGrid, GManifest, GNodes, GRecord, GRoute, GUser } from "@/ui/glyphs";

const sections = [
  { href: "", label: "Delivery board", G: GGrid },
  { href: "/log", label: "Sync log", G: GManifest },
  { href: "/routes", label: "Routes", G: GRoute },
  { href: "/ghl", label: "GHL connection", G: GNodes },
  { href: "/team", label: "Team", G: GUser },
  { href: "/audit", label: "Audit log", G: GRecord },
];

export function ConsoleNav() {
  const here = usePathname();
  // The public demo wears the same sections under its own address.
  const base = here.startsWith("/demo/console") ? "/demo/console" : "/console";
  const on = (href: string) => (href === "" ? here === base : here.startsWith(base + href)) || (href === "/log" && here.startsWith(`${base}/lead`));
  return (
    <nav className="ac-nav" aria-label="Console">
      <ul>
        {sections.map(({ href, label, G }) => (
          <li key={href}><Link href={base + href} aria-current={on(href) ? "page" : undefined}><G size={16} />{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
