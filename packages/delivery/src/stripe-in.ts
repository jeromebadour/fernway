// Stripe payments in (Growth and up). An account points a webhook in its own Stripe account at its Fernway address,
// /api/stripe/in/<token>, and pastes that webhook's signing secret here. Each paid checkout then becomes a lead on the
// route the account picked, like any other lead: the contact found or made in GHL, the stage, the tags, a receipt.
//
// Stripe signs a call the same way Fernway signs its own webhooks (t=<unix seconds>,v1=<hex HMAC-SHA256>), so the call is
// checked here against the account's own secret, and no call is ever made back to the account's Stripe (Fernway never
// holds its keys). The checkout's id is the lead's idempotency key, so Stripe sending an event again, or sending both
// "completed" and "async payment succeeded" for one checkout, gives one lead.
//
// A plan without Stripe payments pauses the link rather than lose a payment: the call is answered 403, so Stripe keeps
// trying (for up to three days) and shows it as failed in the account's own Stripe, where it can be sent again.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { formatWaybill } from "@fernway/core";
import type { Db } from "./db.js";
import { audit, type Actor } from "./console.js";
import { open, seal } from "./crypto.js";
import type { IngestResult } from "./engine.js";
import { entitlementFor, notOnPlan } from "./plans.js";
import { routes, shipments, stripeLinks, type Role, type ShipmentState } from "./schema.js";

/** How old Stripe's signature may be (Stripe's own libraries use 300 s). */
export const STRIPE_TOLERANCE_S = 300;
/** The events that carry a paid checkout. Everything else Stripe sends is answered 200 and left alone. */
export const PAID_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"] as const;

/**
 * The account's own address, the same every time (so it can be given to Stripe before the secret exists, and stays the
 * same through a change of secret), and unguessable without Fernway's key. A call to it is heard only while linked.
 */
export const stripeToken = (key: Buffer, accountId: number) =>
  `stin_${createHmac("sha256", key).update(`stripe-in:${accountId}`).digest("base64url").slice(0, 24)}`;
const SECRET = /^whsec_[A-Za-z0-9+/=_-]{16,200}$/;

/**
 * True when one of the header's v1 signatures is the body's, under this secret, and no older than the tolerance.
 * Stripe may send several v1 values while a secret is being rolled; any one matching is enough, as in Stripe's own code.
 */
export function stripeSigned(secret: string, body: string, header: string | null, now = Math.floor(Date.now() / 1000), tolerance = STRIPE_TOLERANCE_S): boolean {
  if (!header) return false;
  let t = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = Number(v);
    else if (k === "v1") sigs.push(v);
  }
  if (!Number.isInteger(t) || sigs.length === 0 || Math.abs(now - t) > tolerance) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Linking, from the console.

export type StripeLinkView = {
  token: string; routeKey: string; routeLabel: string | null; madeBy: string; createdAt: string;
  lastAt: string | null; lastResult: string | null;
};

export async function stripeLinkView(db: Db, accountId: number): Promise<StripeLinkView | null> {
  const [l] = await db.select({ link: stripeLinks, label: routes.label }).from(stripeLinks)
    .leftJoin(routes, and(eq(routes.accountId, stripeLinks.accountId), eq(routes.key, stripeLinks.routeKey)))
    .where(eq(stripeLinks.accountId, accountId));
  if (!l) return null;
  return {
    token: l.link.token, routeKey: l.link.routeKey, routeLabel: l.label ?? null, madeBy: l.link.madeBy,
    createdAt: l.link.createdAt.toISOString(), lastAt: l.link.lastAt?.toISOString() ?? null, lastResult: l.link.lastResult,
  };
}

export type StripeDraft = { secret?: string; route?: string };
export type StripeResult = { ok: true; token: string } | { ok: false; problems: string[] };

/** Links the account's Stripe, or changes the route or the secret (a blank secret keeps the one kept). */
export async function linkStripe(db: Db, key: Buffer, m: Actor & { role: Role }, d: StripeDraft): Promise<StripeResult> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may link Stripe"] };
  const plan = await entitlementFor(db, m.accountId);
  if (!plan.features.has("payments")) return { ok: false, problems: [`form: ${notOnPlan("payments", plan)}`] };
  const [had] = await db.select().from(stripeLinks).where(eq(stripeLinks.accountId, m.accountId));
  const problems: string[] = [];
  const secret = String(d.secret ?? "").trim();
  if (secret ? !SECRET.test(secret) : !had) problems.push("secret: the webhook's signing secret from Stripe, starting whsec_");
  const routeKey = String(d.route ?? "").trim();
  const [route] = routeKey
    ? await db.select({ calendarId: routes.calendarId, label: routes.label }).from(routes).where(and(eq(routes.accountId, m.accountId), eq(routes.key, routeKey)))
    : [];
  if (!route) problems.push("route: one of this account's routes");
  else if (route.calendarId) problems.push("route: a route without a meeting time (a payment books nothing)");
  if (problems.length) return { ok: false, problems };
  if (had) {
    await db.update(stripeLinks).set({ routeKey, ...(secret ? { secretSealed: seal(key, secret) } : {}) }).where(eq(stripeLinks.accountId, m.accountId));
    await audit(db, m, "stripe.changed", { kind: "stripe", id: "Stripe" }, `route ${route!.label}${secret ? " · new signing secret" : ""}`);
    return { ok: true, token: had.token };
  }
  const token = stripeToken(key, m.accountId);
  await db.insert(stripeLinks).values({ accountId: m.accountId, token, secretSealed: seal(key, secret), routeKey, madeBy: m.name.slice(0, 80) });
  await audit(db, m, "stripe.linked", { kind: "stripe", id: "Stripe" }, `paid checkouts to route ${route!.label}`);
  return { ok: true, token };
}

export async function unlinkStripe(db: Db, m: Actor & { role: Role }): Promise<boolean> {
  if (m.role !== "owner" && m.role !== "admin") return false;
  const [l] = await db.delete(stripeLinks).where(eq(stripeLinks.accountId, m.accountId)).returning({ token: stripeLinks.token });
  if (!l) return false;
  await audit(db, m, "stripe.unlinked", { kind: "stripe", id: "Stripe" }, "Stripe's calls to the old address are refused from now on");
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe's call.

export type StripeInDeps = {
  db: Db;
  key: Buffer;
  /** Hands a lead to the account's own delivery, as the API does. */
  sendLead(accountId: number, input: unknown): Promise<IngestResult>;
  now?: () => number;
};
export type StripeAnswer = { status: number; body: { ok: boolean; result: string; waybill?: string } };

type Session = {
  id?: string; object?: string; payment_status?: string; amount_total?: number | null; currency?: string | null;
  customer_details?: {
    name?: string | null; email?: string | null; phone?: string | null; business_name?: string | null;
    address?: { line1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null } | null;
  } | null;
};

const money = (cents: number | null | undefined, currency: string | null | undefined) =>
  typeof cents === "number" ? `${(cents / 100).toFixed(2)} ${(currency ?? "").toUpperCase()}`.trim() : "an amount Stripe didn't give";

/** The lead a paid checkout becomes: who paid, and a note of what and how much. */
export function paymentLead(s: Session, routeKey: string) {
  const c = s.customer_details ?? {};
  const [firstName, ...rest] = String(c.name ?? "").trim().split(/\s+/).filter(Boolean);
  const a = c.address ?? null;
  const address = a && (a.line1 || a.city || a.postal_code)
    ? Object.fromEntries(Object.entries({ line1: a.line1, city: a.city, state: a.state, postalCode: a.postal_code, country: a.country }).filter(([, v]) => v))
    : undefined;
  const phone = c.phone ? c.phone.replace(/[^\d+]/g, "") : undefined;
  return {
    idempotencyKey: `stripe-${s.id}`,
    source: "stripe",
    route: routeKey,
    contact: {
      ...(firstName ? { firstName: firstName.slice(0, 80) } : {}),
      ...(rest.length ? { lastName: rest.join(" ").slice(0, 80) } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(phone && /^\+?[1-9]\d{6,14}$/.test(phone) ? { phone } : {}),
      ...(c.business_name ? { companyName: c.business_name.slice(0, 120) } : {}),
      ...(address ? { address } : {}),
      message: `Paid ${money(s.amount_total, s.currency)} through Stripe (checkout ${s.id}).`,
    },
  };
}

async function note(db: Db, accountId: number, result: string) {
  await db.update(stripeLinks).set({ lastAt: new Date(), lastResult: result.slice(0, 300) }).where(eq(stripeLinks.accountId, accountId));
}

/** One call from Stripe to /api/stripe/in/<token>, answered so Stripe tries again only when trying again can help. */
export async function receiveStripe(deps: StripeInDeps, token: string, rawBody: string, signature: string | null): Promise<StripeAnswer> {
  const [link] = await deps.db.select().from(stripeLinks).where(eq(stripeLinks.token, token));
  if (!link) return { status: 404, body: { ok: false, result: "no Stripe link at this address" } };
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (!stripeSigned(open(deps.key, link.secretSealed), rawBody, signature, now)) {
    return { status: 400, body: { ok: false, result: "signature: not this account's Stripe, or too old" } };
  }
  let event: { type?: string; data?: { object?: Session } };
  try { event = JSON.parse(rawBody); } catch { return { status: 400, body: { ok: false, result: "not JSON" } }; }
  const s = event.data?.object;
  if (!(PAID_EVENTS as readonly string[]).includes(event.type ?? "") || s?.object !== "checkout.session" || !s.id) {
    return { status: 200, body: { ok: true, result: `ignored: ${String(event.type ?? "no type").slice(0, 60)}` } };
  }
  if (s.payment_status !== "paid") {
    await note(deps.db, link.accountId, `checkout ${s.id} not paid yet (${s.payment_status ?? "no status"}); waiting for Stripe's next call`);
    return { status: 200, body: { ok: true, result: "not paid yet" } };
  }
  const plan = await entitlementFor(deps.db, link.accountId);
  if (!plan.features.has("payments")) {
    const why = notOnPlan("payments", plan);
    await note(deps.db, link.accountId, `paused: ${why}`);
    return { status: 403, body: { ok: false, result: `plan: ${why}` } };
  }
  const r = await deps.sendLead(link.accountId, paymentLead(s, link.routeKey));
  if (!r.ok) {
    // Trying again sends the same checkout and gets the same answer: say why, where the owner looks, and stop Stripe.
    const why = r.problems.join("; ");
    await note(deps.db, link.accountId, `checkout ${s.id} refused: ${why}`);
    return { status: 200, body: { ok: false, result: `refused: ${why}` } };
  }
  await note(deps.db, link.accountId, `checkout ${s.id} picked up as ${r.waybill.number}`);
  return { status: 200, body: { ok: true, result: r.duplicate ? "already picked up" : "picked up", waybill: r.waybill.number } };
}


// ---------------------------------------------------------------------------------------------------------------
// What the console's Stripe payments page shows.

export type StripeInView = {
  /** The plan includes Stripe payments (a link made before stays, paused, when it doesn't). */
  onPlan: boolean;
  /** The address to give Stripe, shown before linking too. */
  address: string;
  link: StripeLinkView | null;
  leads30: number;
  latest: { id: number; waybill: string; state: ShipmentState; tries: number; name: string; message: string | null; at: string }[];
};

export async function stripeInView(db: Db, key: Buffer, accountId: number, appUrl: string): Promise<StripeInView> {
  const [plan, link] = await Promise.all([entitlementFor(db, accountId), stripeLinkView(db, accountId)]);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.select().from(shipments)
    .where(and(eq(shipments.accountId, accountId), eq(shipments.source, "stripe"), gte(shipments.createdAt, since)))
    .orderBy(desc(shipments.createdAt));
  return {
    onPlan: plan.features.has("payments"),
    address: `${appUrl.replace(/\/$/, "")}/api/stripe/in/${stripeToken(key, accountId)}`,
    link,
    leads30: rows.length,
    latest: rows.slice(0, 5).map((r) => ({
      id: r.id, waybill: formatWaybill({ year: r.waybillYear, seq: r.waybillSeq }), state: r.state, tries: r.tries,
      name: [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || r.contact.email || r.contact.phone || "No name",
      message: r.contact.message ?? null, at: r.createdAt.toISOString(),
    })),
  };
}
