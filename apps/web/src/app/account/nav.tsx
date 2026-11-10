"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GCard, GDevice, GKey, GLock, GRecord, GSliders, GTrash, GUser } from "@/ui/glyphs";

const sections = [
  { href: "/account", label: "Profile", G: GUser },
  { href: "/account/preferences", label: "Preferences", G: GSliders },
  { href: "/account/security", label: "Security", G: GLock },
  { href: "/account/devices", label: "Devices", G: GDevice },
  { href: "/account/billing", label: "Plan and billing", G: GCard },
  { href: "/account/keys", label: "API keys", G: GKey },
  { href: "/account/record", label: "Your record", G: GRecord },
];

export function AccountNav() {
  const here = usePathname();
  return (
    <nav className="ac-nav" aria-label="Account">
      <ul>
        {sections.map(({ href, label, G }) => (
          <li key={href}><Link href={href} aria-current={here === href ? "page" : undefined}><G size={16} />{label}</Link></li>
        ))}
      </ul>
      <Link className="ac-delete" href="/account/delete" aria-current={here === "/account/delete" ? "page" : undefined}><GTrash size={16} />Delete account</Link>
    </nav>
  );
}
