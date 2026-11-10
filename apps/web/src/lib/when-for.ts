import "server-only";
import { prefsOf, type Person } from "@fernway/delivery";
import type { When } from "@/ui/when";
import { delivery } from "./connect";

/** The signed-in person's date and time style, with their time zone. */
export async function whenFor(m: Person): Promise<When> {
  const p = await prefsOf(delivery().db, m.userId);
  return { dateStyle: p.dateStyle, clock: p.clock, timeZone: m.timeZone };
}
