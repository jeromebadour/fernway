import type { Metadata } from "next";
import { listDevices } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { requirePerson } from "@/lib/session";
import { whenFor } from "@/lib/when-for";
import { GDevice } from "@/ui/glyphs";
import { stamp } from "@/ui/when";
import { DeviceList, type DeviceCard } from "./list";

export const metadata: Metadata = { title: "Devices · Fernway" };
export const dynamic = "force-dynamic";

const why: Record<string, string> = {
  signed_out: "Signed out on it", signed_out_elsewhere: "Signed out from another device", signed_out_from_device: "Signed out from this page",
  password_changed: "Password changed", two_step_changed: "Two-step sign-in changed", expired: "Ran out after 30 days", account_deleted: "Account deleted",
};

// Devices: every browser signed in to this person, as a stub with its own session number; this one stamped "You are
// here"; the ones that ended in the last 30 days below, each with why.
export default async function Devices() {
  const m = await requirePerson("/account/devices");
  const w = await whenFor(m);
  const list = await listDevices(delivery().db, m.userId, m.sessionId);
  const cards: DeviceCard[] = list.map((d) => ({
    id: d.id, device: d.device, here: d.here, phone: /iPhone|Android|iPad/.test(d.device),
    number: `SN ${String(d.id).padStart(6, "0")}`, since: stamp(d.since, w), lastSeen: d.lastSeen,
    ended: d.endedAt ? { at: stamp(d.endedAt, w), why: why[d.endedWhy ?? "expired"] ?? "Ended" } : null,
  }));
  return (
    <>
      <header className="ac-head">
        <p className="wb-eyebrow"><GDevice size={16} />Devices</p>
        <h1 className="ac-h1">Where you are signed in.</h1>
      </header>
      <DeviceList cards={cards} />
    </>
  );
}
