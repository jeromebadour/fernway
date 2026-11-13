// Fernway's public API, v1: what it takes and what it answers, as zod schemas. The routes parse every answer through
// these before sending it, and the OpenAPI document is generated from the same schemas, so the docs can't drift.
import { formatWaybill, parseWaybill } from "@fernway/core";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.js";
import { leadInput } from "./lead.js";
import { scanKinds, shipments, shipmentStates } from "./schema.js";

/** A lead as an API caller sends it: the engine's own lead, with the source set by Fernway to "api". */
export const apiLeadBody = leadInput.omit({ source: true }).extend({
  source: z.literal("import").optional().describe("Leave it out, or \"import\" from an import tool, so the lead shows as imported. Fernway sets api otherwise."),
});

const number = z.string().regex(/^FW \d{2} \d{5}$/).describe('The waybill number, e.g. "FW 26 00817".');
const state = z.enum(shipmentStates).describe("picked_up, in_transit, waiting (a retry is scheduled), signed (GHL has it), held (needs you), returned.");

export const apiAccepted = z.object({
  ok: z.literal(true),
  duplicate: z.boolean().describe("True when this idempotencyKey was sent before: the same waybill, nothing sent twice."),
  number,
  state,
  links: z.object({
    self: z.string().describe("This lead in the API: GET it for every scan."),
    receipt: z.url().describe("A public receipt page for this lead, valid 30 days, safe to hand to the person who sent it."),
  }),
});

export const apiProblem = z.object({
  ok: z.literal(false),
  problems: z.array(z.string()).describe('What to change, one line each, the field first: "contact.email: a real email address".'),
});

export const apiScan = z.object({
  kind: z.enum(scanKinds),
  step: z.string().nullable().describe("contact, note, appointment or opportunity, when the scan is about one GHL step."),
  at: z.iso.datetime(),
  try: z.number().int().nullable(),
  status: z.number().int().nullable().describe("GHL's HTTP status for this try, when there was one."),
  note: z.string().nullable().describe("Why it waits or was held, in GHL's own words when GHL gave a reason."),
});

export const apiLead = z.object({
  ok: z.literal(true),
  lead: z.object({
    number,
    state,
    pickedUpAt: z.iso.datetime(),
    route: z.string(),
    holdReason: z.string().nullable(),
    meeting: z.iso.datetime().nullable(),
    scans: z.array(apiScan),
  }),
});

export const apiSlots = z.object({
  ok: z.literal(true),
  route: z.string(),
  from: z.iso.datetime().describe("The first moment looked at: now plus two hours' notice."),
  to: z.iso.datetime().describe("The last moment looked at: 14 days on."),
  slots: z.array(z.iso.datetime()).describe("Free start times from the route's GHL calendar, in UTC. Send one back as the lead's slot."),
});

// Examples for the docs. The tests parse each one through its schema, so an example can't show a field that isn't real.
export const examples = {
  lead: {
    idempotencyKey: "order-1001",
    route: "trial",
    contact: { firstName: "Ada", lastName: "Byron", email: "ada@example.com", phone: "+1 503 555 0142", companyName: "Analytical Co", message: "Looking for a 30-day trial." },
  },
  accepted: {
    ok: true, duplicate: false, number: "FW 26 00817", state: "picked_up",
    links: { self: "/api/v1/leads/FW-26-00817", receipt: "https://fernway.jeromebadour.com/track/eyJ..." },
  },
  refused: { ok: false, problems: ["contact.phone: a phone number with country code, like +1 503 555 0142"] },
  booking: {
    idempotencyKey: "roof-check-2210",
    route: "roof-check",
    slot: "2026-11-19T16:00:00.000Z",
    contact: { firstName: "Dana", lastName: "Whitfield", email: "dana@example.com", phone: "+1 253 555 0142",
      address: { line1: "14 Cedar Ln", city: "Tacoma", state: "WA", postalCode: "98406", country: "US" } },
  },
  slots: {
    ok: true, route: "roof-check", from: "2026-11-13T18:00:00.000Z", to: "2026-11-27T18:00:00.000Z",
    slots: ["2026-11-17T16:00:00.000Z", "2026-11-17T20:00:00.000Z", "2026-11-19T16:00:00.000Z"],
  },
  taken: { ok: false, problems: ["slot: that time was just taken; read the route's slots again and pick another"] },
  lead817: {
    ok: true,
    lead: {
      number: "FW 26 00817", state: "signed", pickedUpAt: "2026-11-10T12:04:11.000Z", route: "Trial requests", holdReason: null, meeting: null,
      scans: [
        { kind: "picked_up", step: null, at: "2026-11-10T12:04:11.000Z", try: null, status: null, note: null },
        { kind: "checked", step: null, at: "2026-11-10T12:04:11.000Z", try: null, status: null, note: null },
        { kind: "retry_scheduled", step: "contact", at: "2026-11-10T12:04:12.000Z", try: 1, status: 429, note: "Too many requests" },
        { kind: "handed", step: "contact", at: "2026-11-10T12:04:42.000Z", try: 2, status: 201, note: null },
        { kind: "signed", step: null, at: "2026-11-10T12:04:43.000Z", try: 2, status: null, note: null },
      ],
    },
  },
} as const;

/** The lead with this number, if it is this account's. */
export async function shipmentByNumber(db: Db, accountId: number, text: string): Promise<number | null> {
  const w = parseWaybill(text);
  if (!w) return null;
  const [s] = await db.select({ id: shipments.id }).from(shipments)
    .where(and(eq(shipments.accountId, accountId), eq(shipments.waybillYear, w.year), eq(shipments.waybillSeq, w.seq)));
  return s?.id ?? null;
}

export const waybillPath = (text: string) => formatWaybill(parseWaybill(text)!, "-");

const schema = (s: z.ZodType, io: "input" | "output" = "output") => {
  const out = z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
};
const json = (s: z.ZodType, description: string, example?: unknown) =>
  ({ description, content: { "application/json": { schema: schema(s), ...(example ? { example } : {}) } } });
const problem = (description: string, example?: unknown) => json(apiProblem, description, example);

export function openApi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Fernway API",
      version: "1.0.0",
      description: "Send leads into GoHighLevel and track each one like a shipment. Every lead gets a waybill number and a scan for every step.",
    },
    servers: [{ url: serverUrl }],
    security: [{ key: [] }],
    components: {
      securitySchemes: { key: { type: "http", scheme: "bearer", description: 'An API key, "fw_" then two parts. Shown once when it is made.' } },
    },
    paths: {
      "/api/v1/leads": {
        post: {
          operationId: "sendLead",
          summary: "Send a lead",
          description: "Picks the lead up, checks it and queues its delivery into GHL. The same idempotencyKey sent again gives the same waybill back, with nothing sent twice.",
          requestBody: { required: true, content: { "application/json": { schema: schema(apiLeadBody, "input"), examples: {
            lead: { summary: "A trial request", value: examples.lead },
            booking: { summary: "A booking, with an address and a time from the route's slots", value: examples.booking },
          } } } },
          responses: {
            201: json(apiAccepted, "Picked up. Delivery to GHL happens next, usually within seconds.", examples.accepted),
            200: json(apiAccepted, "Sent before with this idempotencyKey: the same waybill."),
            400: problem("The body isn't JSON."),
            401: problem("No API key, or not a live one."),
            409: problem("Booking routes: the slot was taken since the slots were read. Nothing was made; read them again.", examples.taken),
            422: problem("The lead was refused at the door; nothing was made. Each problem names its field and what the field needs.", examples.refused),
            429: problem("Over the limit: 60 requests a minute per key. Retry-After gives the wait in seconds; the same idempotencyKey sends nothing twice."),
          },
        },
      },
      "/api/v1/routes/{route}/slots": {
        get: {
          operationId: "getSlots",
          summary: "Free times for a booking route",
          description: "The free start times in the GHL calendar a booking route names, for the next 14 days. Show them on your form, and send the one picked as the lead's slot; it is checked again when the lead arrives.",
          parameters: [{ name: "route", in: "path", required: true, description: "The route's key, e.g. roof-check.", schema: { type: "string", pattern: "^[a-z0-9-]{1,40}$" } }],
          responses: {
            200: json(apiSlots, "Free times, oldest first. An empty list means the calendar is full.", examples.slots),
            401: problem("No API key, or not a live one."),
            404: problem("No route with that key on this key's account."),
            422: problem("The route books no meetings (it names no calendar)."),
            429: problem("Over the limit: 60 requests a minute per key. Retry-After gives the wait in seconds."),
            503: problem("GHL couldn't be reached for the calendar. Try again shortly."),
          },
        },
      },
      "/api/v1/leads/{number}": {
        get: {
          operationId: "getLead",
          summary: "Track a lead",
          description: "Where a lead is, and every scan so far.",
          parameters: [{ name: "number", in: "path", required: true, description: 'The waybill number, dashed: "FW-26-00817".', schema: { type: "string", pattern: "^FW-\\d{2}-\\d{5}$" } }],
          responses: {
            200: json(apiLead, "The lead and its scans.", examples.lead817),
            401: problem("No API key, or not a live one."),
            404: problem("No lead with that number on this key's account."),
            429: problem("Over the limit: 60 requests a minute per key. Retry-After gives the wait in seconds."),
          },
        },
      },
    },
  };
}
