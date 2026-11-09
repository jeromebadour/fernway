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
    idempotencyKey: z.string().trim().min(8).max(200),
    source: z.enum(sources),
    route: z.string().regex(/^[a-z0-9-]{1,40}$/),
    contact: z
      .object({
        firstName: trimmed(80).optional(),
        lastName: trimmed(80).optional(),
        email: z.string().trim().toLowerCase().pipe(z.email("a real email address")).optional(),
        phone: phone.optional(),
        companyName: trimmed(120).optional(),
        website: trimmed(200).optional(),
        message: trimmed(2000).optional(),
      })
      .strict()
      .refine((c) => c.email || c.phone, { message: "an email or a phone number, so GHL can match the contact" }),
  })
  .strict();

export type LeadInput = z.input<typeof leadInput>;
export type CheckedLead = { idempotencyKey: string; source: (typeof sources)[number]; route: string; contact: LeadContact };

export type CheckResult = { ok: true; lead: CheckedLead } | { ok: false; problems: string[] };

export function checkLead(input: unknown): CheckResult {
  const parsed = leadInput.safeParse(input);
  if (parsed.success) return { ok: true, lead: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)),
  };
}
