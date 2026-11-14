import "server-only";
import {
  auditView, boardView, connectionView, formsView, ghlEventsFor, leadView, routesView, scoreOf, scoreView, sheetView, hookView, stripeInView, shipmentByWaybill, syncLog, teamView, trackToken,
  type AuditGroup, type LogState, type Role,
} from "@fernway/delivery";
import type { When } from "@/ui/when";
import { delivery } from "./connect";
import { ghlChoices, type Choices } from "./ghl-choices";
import { requirePerson } from "./session";
import { sheetsClient } from "./sheets";
import { whenFor } from "./when-for";

// What every console page reads, from one place: the real account's data, or the public demo's invented one. The pages
// are the same for both; only this changes, with the address the links start from.
export type ConsoleData = {
  board(): ReturnType<typeof boardView>;
  log(f: { q?: string; state?: LogState; page?: number }): ReturnType<typeof syncLog>;
  lead(id: number): ReturnType<typeof leadView>;
  receipt(id: number): string | null;
  routes(): ReturnType<typeof routesView>;
  forms(): ReturnType<typeof formsView>;
  score(): ReturnType<typeof scoreView>;
  sheet(): ReturnType<typeof sheetView>;
  hooks(): ReturnType<typeof hookView>;
  stripe(): ReturnType<typeof stripeInView>;
  scoreOf(id: number): ReturnType<typeof scoreOf>;
  choices(): Promise<Choices>;
  connection(): ReturnType<typeof connectionView>;
  ghlEvents(): ReturnType<typeof ghlEventsFor>;
  team(): ReturnType<typeof teamView>;
  audit(page: number, group?: AuditGroup): ReturnType<typeof auditView>;
  waybillId(waybill: string): Promise<number | null>;
};
export type ConsoleWho = {
  userId: number; name: string; accountId: number; accountName: string; role: Role;
  base: string; demo: boolean; when: When; data: ConsoleData;
};

/** The signed-in person's console (or off to sign in, then back). */
export async function consoleWho(back: string): Promise<ConsoleWho> {
  const m = await requirePerson(back);
  const { db, cfg } = delivery();
  const id = m.accountId;
  return {
    userId: m.userId, name: m.name, accountId: id, accountName: m.accountName, role: m.role, base: "/console", demo: false, when: await whenFor(m),
    data: {
      board: () => boardView(db, id),
      log: (f) => syncLog(db, id, f),
      lead: (sid) => leadView(db, id, sid),
      receipt: (sid) => `/track/${trackToken(cfg.key, sid)}`,
      routes: () => routesView(db, id),
      forms: () => formsView(db, id),
      score: () => scoreView(db, id),
      sheet: () => sheetView(db, id, sheetsClient()?.email ?? null),
      hooks: () => hookView(db, id),
      stripe: () => stripeInView(db, cfg.key, id, process.env.APP_URL ?? "https://fernway.jeromebadour.com"),
      scoreOf: (sid) => scoreOf(db, id, sid),
      choices: () => ghlChoices(id),
      connection: () => connectionView(db, id),
      ghlEvents: () => ghlEventsFor(db, id),
      team: () => teamView(db, id),
      audit: (page, group) => auditView(db, id, page, group),
      waybillId: (wb) => shipmentByWaybill(db, id, wb),
    },
  };
}
