// Break it: the public demo where a visitor makes GHL fail on purpose and watches Fernway deal with it. It runs the
// real engine (the same tries, scans, holds and resends), but against a stand-in GHL inside Fernway, so it can never
// touch a real account, and with the 24 h retry clock sped up and saying so. The failure the visitor picked is part
// of the lead's idempotency key ("breakit-<failure>-<uuid>"), so every try knows what GHL should do, with no race.
import { and, eq } from "drizzle-orm";
import { deliverTry, type Deps, type TryOutcome } from "./engine.js";
import { scans, shipments } from "./schema.js";
import type { GhlAnswer, GhlClient, GhlConnection } from "./ghl.js";

/** The 24 h schedule runs 10 times faster here: 30 s becomes 3 s, 2 min becomes 12 s. */
export const BREAK_IT_SPEED = 10;

export const failures = [
  { key: "busy", label: "Too many requests", ghl: "GHL answers 429 on the first try.", fernway: "Waits 30 s (3 s here) and tries again." },
  { key: "down", label: "Server error", ghl: "GHL answers 503 twice.", fernway: "Waits 30 s, then 2 min (3 s, then 12 s here), then delivers." },
  { key: "timeout", label: "No answer", ghl: "GHL doesn't answer at all on the first try.", fernway: "Gives up on that try after 10 s and tries again." },
  { key: "token", label: "Token expired", ghl: "GHL says the access token ran out.", fernway: "Refreshes the token, then sends again." },
  { key: "refused", label: "Bad data", ghl: "GHL refuses the lead's phone number (422).", fernway: "Holds it with GHL's reason. You resend it." },
  { key: "twice", label: "Sent twice", ghl: "Your site sends the same lead twice.", fernway: "Keeps one waybill and makes one contact." },
] as const;
export type Failure = (typeof failures)[number]["key"];

export const breakItKey = (failure: Failure, uuid: string) => `breakit-${failure}-${uuid}`;
export function failureOf(idempotencyKey: string): Failure | null {
  const m = idempotencyKey.match(/^breakit-([a-z]+)-/);
  return m && failures.some((f) => f.key === m[1]) ? (m[1] as Failure) : null;
}

const ok = (id: string, sent: object): GhlAnswer & { sent: object } => ({ ok: true, status: 201, id, excerpt: `{"id":"${id}"}`, sent });
const no = (status: number | null, next: "retry" | "auth" | "hold", excerpt: string, sent: object): GhlAnswer & { sent: object } =>
  ({ ok: false, status, next, excerpt, sent });

/**
 * The stand-in GHL for one try; with no failure it takes everything at once. `resent` is true once the visitor has resent a held lead (it then goes through, as
 * if they had fixed the data).
 */
export function standInGhl(failure: Failure | null, tryNumber: number, resent: boolean, shipmentId: number): GhlClient {
  return {
    async upsertContact(_conn, contact) {
      const sent = { email: contact.email, firstName: contact.firstName, source: "Fernway (Break it)" };
      if (failure === "busy" && tryNumber === 1) return no(429, "retry", '{"message":"Too many requests"}', sent);
      if (failure === "down" && tryNumber <= 2) return no(503, "retry", '{"message":"Service unavailable"}', sent);
      // Fernway waits 10 s for an answer; sped up 10 times, the stand-in stays silent for 1 s, then the try gives up.
      if (failure === "timeout" && tryNumber === 1) {
        await new Promise((res) => setTimeout(res, 10_000 / BREAK_IT_SPEED));
        return no(null, "retry", "no answer in 10 s", sent);
      }
      if (failure === "token" && tryNumber === 1) return no(401, "auth", '{"message":"Invalid JWT"}', sent);
      if (failure === "refused" && !resent) return no(422, "hold", '{"message":"phone must be a valid number with its country code"}', sent);
      return ok(`breakit_c_${shipmentId}`, sent);
    },
    async upsertOpportunity(_conn, o) {
      return ok(`breakit_o_${shipmentId}`, { stageId: o.stageId, name: o.name });
    },
    async addNote() {
      return ok(`breakit_n_${shipmentId}`, {});
    },
    async bookAppointment() {
      return ok(`breakit_a_${shipmentId}`, {});
    },
    async addTags() {
      return ok("tags", {});
    },
    async removeTags() {
      return ok("tags", {});
    },
    async remove() {
      return { gone: true, status: 200 };
    },
    async listPipelines() {
      return [];
    },
    async listCalendars() {
      return [];
    },
    // The stand-in keeps no contacts to read back.
    async getContact() {
      return null;
    },
    async freeSlots() {
      return [];
    },
  };
}

const standInConnection: GhlConnection = {
  locationId: "breakit",
  async accessToken() {
    return "breakit-token";
  },
  async refresh() {},
};

/** The engine's deps for one Break it try: the real database and queue, the stand-in GHL, the clock sped up. */
export function breakItDeps(base: Deps, failure: Failure | null, tryNumber: number, resent: boolean, shipmentId: number): Deps {
  return {
    ...base,
    ghl: standInGhl(failure, tryNumber, resent, shipmentId),
    connectionFor: async () => standInConnection,
    timeScale: 1 / BREAK_IT_SPEED,
  };
}

/** One try of a Break it lead, as the worker runs it: the failure from its key, and whether the visitor resent it. */
export async function breakItTry(base: Deps, shipmentId: number, tryNumber: number): Promise<TryOutcome> {
  const [s] = await base.db.select({ key: shipments.idempotencyKey }).from(shipments).where(eq(shipments.id, shipmentId));
  if (!s) return "skipped";
  // No failure in the key (a lead sent with the docs' public API key): the stand-in simply takes it, first try.
  const failure = failureOf(s.key);
  const resent = (await base.db.select({ id: scans.id }).from(scans).where(and(eq(scans.shipmentId, shipmentId), eq(scans.kind, "resent")))).length > 0;
  return deliverTry(breakItDeps(base, failure, tryNumber, resent, shipmentId), shipmentId, tryNumber);
}
