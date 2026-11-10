import type { Metadata } from "next";
import Image from "next/image";
import { me } from "@/lib/me";
import { GCamera, GTrash, GUser } from "@/ui/glyphs";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile · Fernway" };
export const dynamic = "force-dynamic";

// Profile: the person, shown the way Fernway shows anyone (a label with their photo, role and account number), then
// the fields they can change.
export default async function Profile() {
  const m = await me();
  const initials = m.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const since = new Date(m.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GUser size={16} />Profile</p>
        <h1 className="ac-h1">How you appear in Fernway.</h1>
      </header>
      <section className="ac-label" aria-label="Your label">
        <div className="ac-photo">
          {m.photo ? <Image src={m.photo} alt="" width={96} height={96} unoptimized /> : <span className="wb-ava ac-ava-lg">{initials}</span>}
        </div>
        <div className="ac-label-who">
          <p className="ac-label-name">{m.name}<span className="wb-role">{m.role}</span></p>
          <p className="ac-label-org">{m.company}</p>
          <dl className="ac-label-facts">
            <div><dt>Account</dt><dd>{m.accountNo}</dd></div>
            <div><dt>Plan</dt><dd>{m.plan}</dd></div>
            <div><dt>Since</dt><dd>{since}</dd></div>
          </dl>
        </div>
        <div className="ac-photo-do">
          <button type="button" className="wb-ghost fm-btn"><GCamera size={16} />Upload photo</button>
          {m.photo && <button type="button" className="wb-ghost fm-btn ac-stop"><GTrash size={16} />Remove</button>}
          <span className="fm-hint">PNG, JPEG or WebP, up to 2 MB. Cropped square.</span>
        </div>
      </section>
      <ProfileForm initial={{ name: m.name, company: m.company, email: m.email, emailConfirmed: m.emailConfirmed, timeZone: m.timeZone }} />
    </>
  );
}
