"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GGrid, GManifest, GNodes, GRecord, GRoute, GUser } from "@/ui/glyphs";

const sections = [
  { href: "/console", label: "Delivery board", G: GGrid },
  { href: "/console/log", label: "Sync log", G: GManifest },
  { href: "/console/routes", label: "Routes", G: GRoute },
  { href: "/console/ghl", label: "GHL connection", G: GNodes },
  { href: "/console/team", label: "Team", G: GUser },
  { href: "/console/audit", label: "Audit log", G: GRecord },
];

export function ConsoleNav() {
  const here = usePathname();
  const on = (href: string) => (href === "/console" ? here === href : here.startsWith(href)) || (href === "/console/log" && here.startsWith("/console/lead"));
  return (
    <nav className="ac-nav" aria-label="Console">
      <ul>
        {sections.map(({ href, label, G }) => (
          <li key={href}><Link href={href} aria-current={on(href) ? "page" : undefined}><G size={16} />{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
