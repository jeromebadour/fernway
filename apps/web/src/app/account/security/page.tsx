import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { recoveryLeft, users } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { GLock } from "@/ui/glyphs";
import { day } from "@/ui/when";
import { PasswordCard, TwoStepCard } from "./parts";

export const metadata: Metadata = { title: "Security · Fernway" };
export const dynamic = "force-dynamic";

// Security: the password, and two-step sign-in with an authenticator app and its recovery codes.
export default async function Security() {
  const m = await requirePerson("/account/security");
  const w = await whenFor(m);
  const { db } = delivery();
  const [u] = await db.select({ changed: users.passwordChangedAt, since: users.totpEnabledAt }).from(users).where(eq(users.id, m.userId));
  const left = u!.since ? await recoveryLeft(db, m.userId) : 0;
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GLock size={16} />Security</p>
        <h1 className="ac-h1">What it takes to sign in as you.</h1>
      </header>
      <PasswordCard changed={u!.changed.toISOString()} email={m.email} />
      <TwoStepCard on={u!.since ? day(u!.since, w) : null} left={left} email={m.email} />
    </>
  );
}
