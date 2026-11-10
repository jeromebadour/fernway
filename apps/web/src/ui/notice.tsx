"use client";
// One notice for every ending that lands on another page (BUILD-RULES 2.21): fed by ?done=<key>, which leaves the
// address at once, so a reload or a shared link never repeats it. Endings that leave you signed out stay until closed.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GCheck, GMail, GSignOut, GJump } from "./glyphs";

const notices: Record<string, { title: string; line: string; G: (p: { size?: number }) => React.ReactNode; stays?: boolean }> = {
  welcome: { title: "Your account is ready", line: "Your 14-day trial has started. A link to confirm your email is on its way.", G: GCheck },
  confirmed: { title: "Email confirmed", line: "Fernway will tell you here and by email when a lead needs you.", G: GMail },
  "signed-out": { title: "Signed out", line: "This device is signed out. Your account and its leads are as you left them.", G: GSignOut, stays: true },
  "password-changed": { title: "Password changed", line: "Every device was signed out. Sign in with the new password.", G: GCheck, stays: true },
  "signed-out-elsewhere": { title: "Signed out elsewhere", line: "This session ended on another device. Sign in again to carry on.", G: GSignOut, stays: true },
};

export function Notice() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const done = params.get("done");
  // The notice is the one the page arrived with; the key then leaves the address.
  const [key, setKey] = useState<string | null>(() => (done && notices[done] ? done : null));
  useEffect(() => {
    if (!done) return;
    const rest = new URLSearchParams(params);
    rest.delete("done");
    router.replace(rest.size ? `${path}?${rest}` : path, { scroll: false });
  }, [done, params, path, router]);
  useEffect(() => {
    if (!key || notices[key]!.stays) return;
    const t = setTimeout(() => setKey(null), 6_000);
    return () => clearTimeout(t);
  }, [key]);
  if (!key) return null;
  const n = notices[key]!;
  return (
    <div className="nt" role="status">
      <n.G size={18} />
      <div><p className="nt-title">{n.title}</p><p className="nt-line">{n.line}</p></div>
      <button type="button" onClick={() => setKey(null)} aria-label="Close"><GJump size={14} />Close</button>
    </div>
  );
}
