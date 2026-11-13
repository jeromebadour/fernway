// Checking a lead before it travels: the "checked" scan. Anything that can't reach GHL is refused here, at the door,
// with a reason the sender can act on, instead of being held later.
import { z } from "zod";
import type { LeadContact } from "./schema.js";
import { sources } from "./schema.js";

const trimmed = (max: number) => z.string().trim().min(1).max(max);

// GHL wants E.164 phone numbers. We keep the digits and a leading +; anything shorter than a real number is refused.
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+?[1-9]\d{6,14}$/, "a phone number with country code, like +1 503 555 0142"));

export const leadInput = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200).describe("Your own id for this lead, 8 to 200 characters, like an order or form-entry id. Sent again, it gives the same waybill back."),
    source: z.enum(sources),
    route: z.string().regex(/^[a-z0-9-]{1,40}$/).describe("Which route the lead takes: the pipeline, stage and tags it lands in. Set up per account."),
    // The time picked on a booking route (ISO with its offset), checked against the route's calendar at the door.
    slot: z.iso.datetime({ offset: true }).optional().describe("Booking routes only: the meeting time, ISO 8601 with its offset, e.g. 2026-11-12T14:30:00+03:00."),
    contact: z
      .object({
        firstName: trimmed(80).optional().describe("Up to 80 characters."),
        lastName: trimmed(80).optional().describe("Up to 80 characters."),
        email: z.string().trim().toLowerCase().pipe(z.email("a real email address")).optional().describe("Email or phone is required. GHL matches the contact on it, so one person is one contact."),
        phone: phone.optional().describe("With its country code, e.g. +1 503 555 0142. Spaces, dots and brackets are fine."),
        companyName: trimmed(120).optional().describe("Up to 120 characters."),
        website: trimmed(200).optional().describe("Up to 200 characters."),
        message: trimmed(2000).optional().describe("Up to 2,000 characters. Added to the contact in GHL as a note."),
        address: z
          .object({
            line1: trimmed(200).optional().describe("Street and number, e.g. 14 Cedar Ln."),
            city: trimmed(100).optional().describe("City, e.g. Tacoma."),
            state: trimmed(100).optional().describe("State or region, e.g. WA."),
            postalCode: trimmed(20).optional().describe("ZIP or postal code."),
            country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "a two-letter country code, like US").optional().describe("Two letters (ISO 3166), e.g. US."),
          })
          .strict()
          .refine((a) => Object.values(a).some(Boolean), { message: "at least one part of the address" })
          .optional()
          .describe("Where the work is. Sent to the contact's own address fields in GHL."),
      })
      .strict()
      .describe("The person. Only these fields; anything else is refused.")
      .refine((c) => c.email || c.phone, { message: "an email or a phone number, so GHL can match the contact" }),
  })
  .strict();

export type LeadInput = z.input<typeof leadInput>;
export type CheckedLead = { idempotencyKey: string; source: (typeof sources)[number]; route: string; slot?: string; contact: LeadContact };

export type CheckResult = { ok: true; lead: CheckedLead } | { ok: false; problems: string[] };

export function checkLead(input: unknown): CheckResult {
  const parsed = leadInput.safeParse(input);
  if (parsed.success) return { ok: true, lead: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
  };
}
