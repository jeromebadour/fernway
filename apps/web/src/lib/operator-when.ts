import "server-only";
import type { When } from "@/ui/when";
import { currentPerson } from "./session";
import { whenFor } from "./when-for";

/** The staff member's own date and time style and zone. */
export async function staffWhen(): Promise<When> {
  const p = await currentPerson();
  return p ? whenFor(p) : { dateStyle: "day-month", clock: "24h", timeZone: "UTC" };
}
