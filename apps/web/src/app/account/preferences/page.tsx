import type { Metadata } from "next";
import { prefsOf } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { GSliders } from "@/ui/glyphs";
import { PrefsForm } from "./form";

export const metadata: Metadata = { title: "Preferences · Fernway" };
export const dynamic = "force-dynamic";

export default async function Preferences() {
  const m = await requirePerson("/account/preferences");
  const p = await prefsOf(delivery().db, m.userId);
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GSliders size={16} />Preferences</p>
        <h1 className="ac-h1">How Fernway reads to you.</h1>
      </header>
      <PrefsForm initial={p} timeZone={m.timeZone} email={m.email} />
    </>
  );
}
