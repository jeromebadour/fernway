import type { Metadata } from "next";
import { requirePerson } from "@/lib/session";
import { GUser } from "@/ui/glyphs";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile · Fernway" };
export const dynamic = "force-dynamic";

// Days left until a time, read outside rendering (the clock is the server's, at request time).
function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

// Profile: the person, shown the way Fernway shows anyone (a label with their photo, role and account number), then
// the fields they can change.
export default async function Profile() {
  const m = await requirePerson();
  const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
  const trialDays = m.trialEndsAt ? daysUntil(m.trialEndsAt) : null;
  const initials = m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const since = new Date(m.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GUser size={16} />Profile</p>
        <h1 className="ac-h1">How you appear in Fernway.</h1>
      </header>
      <section className="ac-label" aria-label="Your label">
        <div className="ac-photo"><span className="wb-ava ac-ava-lg">{initials}</span></div>
        <div className="ac-label-who">
          <p className="ac-label-name">{m.name}<span className="wb-role">{role}</span></p>
          <p className="ac-label-org">{m.accountName}</p>
          <dl className="ac-label-facts">
            <div><dt>Account</dt><dd>AC {String(m.accountId).padStart(6, "0")}</dd></div>
            <div><dt>Plan</dt><dd>{trialDays !== null ? `Trial, ${trialDays} days left` : "Trial"}</dd></div>
            <div><dt>Since</dt><dd>{since}</dd></div>
          </dl>
        </div>
      </section>
      <ProfileForm initial={{ name: m.name, company: m.accountName, email: m.email, emailConfirmed: m.emailConfirmed, timeZone: m.timeZone }} owner={m.role === "owner"} />
    </>
  );
}
