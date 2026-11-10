import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { accounts, recordView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { intake } from "@/lib/intake";
import { requirePerson } from "@/lib/session";
import { GTrash } from "@/ui/glyphs";
import { DeleteFlow } from "./flow";

export const metadata: Metadata = { title: "Delete account · Fernway" };
export const dynamic = "force-dynamic";

// Delete account: owner only. What goes from each place, in the order it goes, then the dialog.
export default async function Delete() {
  const m = await requirePerson("/account/delete");
  if (m.role !== "owner") notFound();
  const { db } = delivery();
  const { accountId: site } = intake();
  const v = (await recordView(db, m.userId, m.accountId, site))!;
  const [a] = await db.select({ customer: accounts.stripeCustomerId, plan: accounts.plan }).from(accounts).where(eq(accounts.id, m.accountId));
  const inGhl = v.leads.filter((l) => l.contactId).length;
  const steps = [
    { what: "GHL", now: inGhl ? `The contact and ${inGhl === 1 ? "lead" : `${inGhl} leads`} Fernway made from your forms, with their notes and meetings.` : "Nothing of yours is in GHL." },
    { what: "Stripe", now: a?.customer ? `${a.plan ? "The plan is cancelled at once, with no refund for the rest of the month, and the" : "The"} card on file is removed.` : "No card was ever given." },
    { what: "Fernway", now: `${m.accountName} (AC ${String(m.accountId).padStart(6, "0")}), your sign-in, ${v.counts.devicesSignedIn === 1 ? "this device's session" : `${v.counts.devicesSignedIn} devices' sessions`}, ${v.counts.apiKeysLive} API ${v.counts.apiKeysLive === 1 ? "key" : "keys"}, every lead and receipt.` },
  ];
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow ac-stop"><GTrash size={16} />Delete account</p>
        <h1 className="ac-h1">Remove {m.accountName} from everywhere.</h1>
      </header>
      <DeleteFlow steps={steps} name={m.accountName} />
    </>
  );
}
