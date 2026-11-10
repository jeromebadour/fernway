// Fernway's own plans and billing, through Stripe (test mode only). Stripe holds the subscription; Fernway keeps a copy
// that is always re-read from Stripe's own answer, never from the event's payload, so events that arrive late or out of
// order can't put an old state back. Each event is handled once. The first paid invoice moves the account's owner to
// Customer in Fernway's own GHL as a lead like any other: the same queue, retries and receipt.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import Stripe from "stripe";
import { formatWaybill } from "@fernway/core";
import type { Db } from "./db.js";
import type { IngestResult } from "./engine.js";
import {
  accounts,
  memberships,
  planKeys,
  scans,
  shipments,
  stripeEvents,
  stripeInvoices,
  users,
  type BillingStatus,
  type PlanKey,
} from "./schema.js";

/** The API version Fernway is written against, the same as its webhook destination in Stripe. */
export const STRIPE_API_VERSION = "2026-10-28.endive";

// Fernway's prices (set 2026-11-10): leads signed for in GHL a month. Held and returned leads never count.
export const PLANS: Record<PlanKey, { name: string; cents: number; leads: number }> = {
  starter: { name: "Starter", cents: 1900, leads: 500 },
  growth: { name: "Growth", cents: 4900, leads: 5000 },
  scale: { name: "Scale", cents: 14900, leads: 25000 },
};
export const lookupKey = (plan: PlanKey) => `fernway_${plan}_monthly`;
const planOfLookup = (key: string | null | undefined): PlanKey | null =>
  planKeys.find((p) => lookupKey(p) === key) ?? null;

export function createStripe(secretKey: string, at?: { host: string; port: number; protocol: "http" | "https" }): Stripe {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) throw new Error("STRIPE_SECRET_KEY must be a test key (sk_test_)");
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 15_000,
    appInfo: { name: "Fernway", url: "https://fernway.jeromebadour.com" },
    ...(at ?? {}),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The catalog: one product and one monthly price per plan, found by lookup key and made when missing, so a fresh
// Stripe account needs no clicks. A price that no longer matches PLANS gets a new price that takes over the key.

export type Catalog = { prices: Record<PlanKey, string>; portalConfig: string };
let catalogCache: { at: number; value: Promise<Catalog> } | null = null;

export function catalog(stripe: Stripe): Promise<Catalog> {
  if (!catalogCache || Date.now() - catalogCache.at > 10 * 60_000) {
    const value = buildCatalog(stripe);
    catalogCache = { at: Date.now(), value };
    value.catch(() => { catalogCache = null; });
  }
  return catalogCache.value;
}
export const forgetCatalog = () => { catalogCache = null; };

async function buildCatalog(stripe: Stripe): Promise<Catalog> {
  const found = await stripe.prices.list({ lookup_keys: planKeys.map(lookupKey), active: true, limit: 10 });
  const products = (await stripe.products.list({ active: true, limit: 100 })).data;
  const prices = {} as Record<PlanKey, string>;
  const productOf = {} as Record<PlanKey, string>;
  for (const plan of planKeys) {
    const want = PLANS[plan];
    const price = found.data.find((p) => p.lookup_key === lookupKey(plan));
    if (price && price.unit_amount === want.cents && price.currency === "usd" && price.recurring?.interval === "month") {
      prices[plan] = price.id;
      productOf[plan] = typeof price.product === "string" ? price.product : price.product.id;
      continue;
    }
    const product = products.find((p) => p.metadata.fernway_plan === plan)
      ?? await stripe.products.create(
        { name: `Fernway ${want.name}`, description: `${want.leads.toLocaleString("en-US")} leads signed for in GHL a month`, metadata: { fernway_plan: plan } },
        { idempotencyKey: `fw-product-${plan}` },
      );
    const made = await stripe.prices.create({
      product: product.id, currency: "usd", unit_amount: want.cents, recurring: { interval: "month" },
      lookup_key: lookupKey(plan), transfer_lookup_key: true, metadata: { fernway_plan: plan },
    });
    prices[plan] = made.id;
    productOf[plan] = product.id;
  }
  return { prices, portalConfig: await portalConfig(stripe, prices, productOf) };
}

// The customer portal: card, invoices, switching between the three plans, and cancelling at the end of the period.
async function portalConfig(stripe: Stripe, prices: Record<PlanKey, string>, productOf: Record<PlanKey, string>): Promise<string> {
  const products = planKeys.map((p) => ({ product: productOf[p], prices: [prices[p]] }));
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products },
  };
  const want = planKeys.map((p) => prices[p]).sort().join();
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const mine = list.data.find((c) => c.metadata?.fernway === "1");
  if (mine) {
    const has = (mine.features.subscription_update.products ?? []).flatMap((p) => p.prices).sort().join();
    if (has !== want) await stripe.billingPortal.configurations.update(mine.id, { features });
    return mine.id;
  }
  const made = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Fernway: your plan, card and invoices" },
    features,
    metadata: { fernway: "1" },
  });
  return made.id;
}

// ---------------------------------------------------------------------------------------------------------------
// Starting a plan and managing it.

export type Payer = { accountId: number; accountName: string; email: string; name: string };
export type Started = { ok: true; url: string } | { ok: false; problem: string };

/** The account's Stripe customer, made once (the same key twice gives the same customer). */
export async function customerFor(db: Db, stripe: Stripe, who: Payer): Promise<string> {
  const [a] = await db.select({ id: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, who.accountId));
  if (a?.id) return a.id;
  const made = await stripe.customers.create(
    { email: who.email, name: who.accountName, metadata: { account_id: String(who.accountId) } },
    { idempotencyKey: `fw-customer-${who.accountId}` },
  );
  await db.update(accounts).set({ stripeCustomerId: made.id })
    .where(and(eq(accounts.id, who.accountId), isNull(accounts.stripeCustomerId)));
  const [now] = await db.select({ id: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, who.accountId));
  return now!.id!;
}

/** A Stripe Checkout page for a plan. An account that already pays changes its plan in the portal instead. */
export async function startCheckout(db: Db, stripe: Stripe, who: Payer, plan: PlanKey, appUrl: string): Promise<Started> {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, who.accountId));
  if (!a) return { ok: false, problem: "account: not found" };
  if (a.stripeSubscriptionId && a.billingStatus && !["canceled", "incomplete_expired"].includes(a.billingStatus)) {
    return { ok: false, problem: "plan: this account already has a plan; change it from Card, plan and invoices" };
  }
  const { prices } = await catalog(stripe);
  const customer = await customerFor(db, stripe, who);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: String(who.accountId),
    line_items: [{ price: prices[plan], quantity: 1 }],
    subscription_data: { metadata: { account_id: String(who.accountId), fernway_plan: plan } },
    metadata: { account_id: String(who.accountId), fernway_plan: plan },
    success_url: `${appUrl}/account/billing?done=plan-started&paid=1`,
    cancel_url: `${appUrl}/account/billing`,
  });
  return session.url ? { ok: true, url: session.url } : { ok: false, problem: "stripe: no checkout page came back; try again" };
}

/** Stripe's customer portal for the account: card, invoices, switch plan, cancel. */
export async function startPortal(db: Db, stripe: Stripe, accountId: number, appUrl: string): Promise<Started> {
  const [a] = await db.select({ customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  if (!a?.customer) return { ok: false, problem: "billing: this account has not paid for a plan yet" };
  const { portalConfig } = await catalog(stripe);
  const session = await stripe.billingPortal.sessions.create({
    customer: a.customer, configuration: portalConfig, return_url: `${appUrl}/account/billing`,
  });
  return { ok: true, url: session.url };
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe's webhook.

/** The event, if its signature is Stripe's for this body and secret and it is recent; otherwise null. */
export function readEvent(stripe: Stripe, rawBody: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return null;
  }
}

export type BillingDeps = {
  db: Db;
  stripe: Stripe;
  /** Sends a lead into Fernway's own account (the public site's), as the site's forms do. */
  sendLead(input: unknown): Promise<IngestResult>;
};
export type Handled = "done" | "repeat" | "ignored";

export const handledEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

/** Handles one verified event. Throws when the work could not be done, so Stripe sends the event again later. */
export async function handleEvent(deps: BillingDeps, event: Stripe.Event): Promise<Handled> {
  const [seen] = await deps.db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
  if (seen) return "repeat";
  if (!(handledEvents as readonly string[]).includes(event.type)) return "ignored";

  let accountId: number | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode !== "subscription" || !s.subscription) break;
      const id = Number(s.client_reference_id);
      const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
      if (Number.isInteger(id) && customer) {
        await deps.db.update(accounts).set({ stripeCustomerId: customer })
          .where(and(eq(accounts.id, id), isNull(accounts.stripeCustomerId)));
      }
      accountId = await syncSubscription(deps, typeof s.subscription === "string" ? s.subscription : s.subscription.id);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      accountId = await syncSubscription(deps, event.data.object.id);
      break;
    case "invoice.paid":
    case "invoice.payment_failed":
      accountId = await syncInvoice(deps, event.data.object.id!);
      break;
  }
  await deps.db.insert(stripeEvents).values({ id: event.id, type: event.type, accountId }).onConflictDoNothing();
  return "done";
}

const ended = (s: string) => s === "canceled" || s === "incomplete_expired";
const at = (unix: number | null | undefined) => (unix ? new Date(unix * 1000) : null);

async function accountOfCustomer(db: Db, customer: string | null, hint?: string): Promise<number | null> {
  if (customer) {
    const [a] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.stripeCustomerId, customer));
    if (a) return a.id;
  }
  const id = Number(hint);
  if (!Number.isInteger(id) || id < 1) return null;
  const [a] = await db.select({ id: accounts.id, customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, id));
  return a && (!a.customer || a.customer === customer) ? a.id : null;
}

/** Copies a subscription's current state, as Stripe answers it now, onto its account. */
export async function syncSubscription(deps: BillingDeps, subscriptionId: string): Promise<number | null> {
  const sub = await deps.stripe.subscriptions.retrieve(subscriptionId);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const accountId = await accountOfCustomer(deps.db, customer, sub.metadata.account_id);
  if (!accountId) return null;
  const [a] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a) return null;
  // An old subscription that ended never overwrites a newer one on the same account.
  if (a.stripeSubscriptionId && a.stripeSubscriptionId !== sub.id && ended(sub.status)) return accountId;

  const item = sub.items.data[0];
  const gone = ended(sub.status);
  await deps.db.update(accounts).set({
    stripeCustomerId: customer,
    stripeSubscriptionId: gone ? null : sub.id,
    plan: gone ? null : planOfLookup(item?.price.lookup_key),
    billingStatus: sub.status as BillingStatus,
    periodStart: gone ? null : at(item?.current_period_start),
    periodEnd: gone ? null : at(item?.current_period_end),
    cancelAtPeriodEnd: !gone && (sub.cancel_at_period_end || sub.cancel_at !== null),
  }).where(eq(accounts.id, accountId));
  return accountId;
}

/** Copies an invoice onto its account; the first one paid moves the owner to Customer in Fernway's own GHL. */
export async function syncInvoice(deps: BillingDeps, invoiceId: string): Promise<number | null> {
  const inv = await deps.stripe.invoices.retrieve(invoiceId);
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
  const accountId = await accountOfCustomer(deps.db, customer, inv.parent?.subscription_details?.metadata?.account_id);
  if (!accountId) return null;
  const line = inv.lines.data[0];
  const priceId = line?.pricing?.price_details?.price;
  const { prices } = await catalog(deps.stripe);
  const plan = planKeys.find((p) => prices[p] === (typeof priceId === "string" ? priceId : priceId?.id)) ?? null;
  const row = {
    accountId,
    number: inv.number,
    status: (inv.status ?? "draft") as "draft" | "open" | "paid" | "uncollectible" | "void",
    attemptedUnpaid: inv.status === "open" && inv.attempted,
    amountCents: inv.status === "paid" ? inv.amount_paid : inv.amount_due,
    currency: inv.currency,
    plan,
    periodStart: at(line?.period.start),
    periodEnd: at(line?.period.end),
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
    createdAt: at(inv.created)!,
  };
  await deps.db.insert(stripeInvoices).values({ id: inv.id!, ...row })
    .onConflictDoUpdate({ target: stripeInvoices.id, set: row });
  if (inv.status === "paid" && inv.amount_paid > 0) await moveToCustomer(deps, accountId, plan, inv.number, inv.amount_paid);
  return accountId;
}

/** Once per account: its owner travels to Customer in Fernway's own GHL, on route "customer", with a receipt. */
async function moveToCustomer(deps: BillingDeps, accountId: number, plan: PlanKey | null, number: string | null, cents: number) {
  const [a] = await deps.db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a || a.customerShipmentId) return;
  const [owner] = await deps.db.select({ name: users.name, email: users.email })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.accountId, accountId), eq(memberships.role, "owner"))).limit(1);
  if (!owner) return;
  const [firstName, ...rest] = owner.name.trim().split(/\s+/);
  const r = await deps.sendLead({
    idempotencyKey: `stripe-customer-${accountId}`,
    source: "stripe",
    route: "customer",
    contact: {
      firstName,
      ...(rest.length ? { lastName: rest.join(" ") } : {}),
      email: owner.email,
      companyName: a.name,
      message: `Paid for Fernway ${plan ? PLANS[plan].name : "a plan"}: invoice ${number ?? "(no number)"}, $${(cents / 100).toFixed(2)}. Account AC ${String(accountId).padStart(6, "0")}.`,
    },
  });
  if (!r.ok) throw new Error(`the move to Customer was refused: ${r.problems.join("; ")}`);
  await deps.db.update(accounts).set({ customerShipmentId: r.waybill.id })
    .where(and(eq(accounts.id, accountId), isNull(accounts.customerShipmentId)));
}

// ---------------------------------------------------------------------------------------------------------------
// What the Billing page shows.

/** Leads signed for in [from, to): each lead once, at its first signature, however many tries it took. */
export async function signedBetween(db: Db, accountId: number, from: Date, to: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(
      db.select({ first: sql<Date>`min(${scans.at})`.as("first") })
        .from(scans)
        .innerJoin(shipments, eq(shipments.id, scans.shipmentId))
        .where(and(eq(shipments.accountId, accountId), eq(scans.kind, "signed")))
        .groupBy(shipments.id)
        .as("f"),
    )
    .where(sql`f.first >= ${from.toISOString()} and f.first < ${to.toISOString()}`);
  return r?.n ?? 0;
}

export type BillingView = {
  plan: PlanKey | null;
  status: BillingStatus | null;
  trialEndsAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  endsAtPeriodEnd: boolean;
  hasCustomer: boolean;
  used: number;
  usedFrom: string;
  usedTo: string;
  invoices: { id: string; number: string | null; status: string; failed: boolean; cents: number; currency: string;
    plan: PlanKey | null; periodStart: string | null; periodEnd: string | null; hostedUrl: string | null; pdfUrl: string | null; at: string }[];
  customerMove: { shipmentId: number; waybill: string; state: string } | null;
};

export async function billingView(db: Db, accountId: number, now = new Date()): Promise<BillingView | null> {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a) return null;
  // The period leads are counted in: the paid month, else the trial, else the last 30 days.
  const from = a.periodStart ?? (a.trialEndsAt ? a.createdAt : new Date(now.getTime() - 30 * 86_400_000));
  const to = a.periodEnd ?? a.trialEndsAt ?? now;
  const used = await signedBetween(db, accountId, from, new Date(Math.min(to.getTime(), now.getTime() + 1)));
  const invoices = await db.select().from(stripeInvoices).where(eq(stripeInvoices.accountId, accountId))
    .orderBy(desc(stripeInvoices.createdAt)).limit(24);
  let customerMove: BillingView["customerMove"] = null;
  if (a.customerShipmentId) {
    const [s] = await db.select().from(shipments).where(eq(shipments.id, a.customerShipmentId));
    if (s) customerMove = { shipmentId: s.id, waybill: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), state: s.state };
  }
  return {
    plan: a.plan,
    status: a.billingStatus,
    trialEndsAt: a.trialEndsAt?.toISOString() ?? null,
    periodStart: a.periodStart?.toISOString() ?? null,
    periodEnd: a.periodEnd?.toISOString() ?? null,
    endsAtPeriodEnd: a.cancelAtPeriodEnd,
    hasCustomer: a.stripeCustomerId !== null,
    used,
    usedFrom: from.toISOString(),
    usedTo: to.toISOString(),
    invoices: invoices.map((i) => ({
      id: i.id, number: i.number, status: i.status, failed: i.attemptedUnpaid, cents: i.amountCents, currency: i.currency, plan: i.plan,
      periodStart: i.periodStart?.toISOString() ?? null, periodEnd: i.periodEnd?.toISOString() ?? null,
      hostedUrl: i.hostedUrl, pdfUrl: i.pdfUrl, at: i.createdAt.toISOString(),
    })),
    customerMove,
  };
}
