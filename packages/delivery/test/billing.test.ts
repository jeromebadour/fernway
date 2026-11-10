// Billing against a fake Stripe that answers like the real API (form-encoded requests, its object shapes), and a real
// database. Webhook signatures are made with Stripe's own SDK and the test secret.
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  billingView,
  catalog,
  createStripe,
  forgetCatalog,
  handleEvent,
  lookupKey,
  readEvent,
  signedBetween,
  startCheckout,
  startPortal,
  type BillingDeps,
} from "../src/billing.js";
import { ingestLead } from "../src/engine.js";
import { signUp } from "../src/people.js";
import { accounts, routes, scans, shipments, stripeEvents, stripeInvoices } from "../src/schema.js";
import { createDb, freshDatabase, testDeps } from "./support.js";

const API = "https://api.stripe.com/v1";
const SECRET = "whsec_testsecret123";
const APP = "https://fernway.test";

// ----- The fake Stripe ------------------------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake answers in Stripe's own loose JSON shapes
type Obj = Record<string, any>;
const fake = {
  n: 0,
  products: [] as Obj[],
  prices: [] as Obj[],
  portals: [] as Obj[],
  customers: [] as Obj[],
  sessions: [] as Obj[],
  subs: new Map<string, Obj>(),
  invoices: new Map<string, Obj>(),
  idem: new Map<string, Obj>(),
  posts: [] as { path: string; form: Record<string, string>; idem: string | null }[],
  reset() {
    // Ids keep counting across tests: they share one database, as Stripe ids are unique forever.
    Object.assign(this, { products: [], prices: [], portals: [], customers: [], sessions: [], posts: [] });
    this.subs.clear(); this.invoices.clear(); this.idem.clear();
  },
  id(prefix: string) { return `${prefix}_${(++this.n).toString().padStart(6, "0")}T`; },
};
const form = async (r: Request) => Object.fromEntries(new URLSearchParams(await r.text()));
const list = (data: Obj[]) => ({ object: "list", data, has_more: false, url: "/v1/x" });
const posted = async (r: Request, path: string) => {
  const f = await form(r);
  fake.posts.push({ path, form: f, idem: r.headers.get("idempotency-key") });
  return f;
};

const server = setupServer(
  http.get(`${API}/prices`, ({ request }) => {
    const q = new URL(request.url).searchParams;
    const keys = [...q.entries()].filter(([k]) => k.startsWith("lookup_keys")).map(([, v]) => v);
    return HttpResponse.json(list(fake.prices.filter((p) => p.active && keys.includes(p.lookup_key))));
  }),
  http.get(`${API}/products`, () => HttpResponse.json(list(fake.products.filter((p) => p.active)))),
  http.post(`${API}/products`, async ({ request }) => {
    const idem = request.headers.get("idempotency-key");
    if (idem && fake.idem.has(idem)) return HttpResponse.json(fake.idem.get(idem));
    const f = await posted(request, "products");
    const p = { id: fake.id("prod"), object: "product", active: true, name: f.name, metadata: { fernway_plan: f["metadata[fernway_plan]"] } };
    fake.products.push(p);
    if (idem) fake.idem.set(idem, p);
    return HttpResponse.json(p);
  }),
  http.post(`${API}/prices`, async ({ request }) => {
    const f = await posted(request, "prices");
    if (f.transfer_lookup_key === "true") for (const old of fake.prices) if (old.lookup_key === f.lookup_key) old.lookup_key = null;
    const p = { id: fake.id("price"), object: "price", active: true, product: f.product, currency: f.currency,
      unit_amount: Number(f.unit_amount), recurring: { interval: f["recurring[interval]"] }, lookup_key: f.lookup_key, metadata: {} };
    fake.prices.push(p);
    return HttpResponse.json(p);
  }),
  http.get(`${API}/billing_portal/configurations`, () => HttpResponse.json(list(fake.portals))),
  http.post(`${API}/billing_portal/configurations`, async ({ request }) => {
    const f = await posted(request, "portal-config");
    const c = { id: fake.id("bpc"), object: "billing_portal.configuration", active: true, metadata: { fernway: f["metadata[fernway]"] },
      features: { subscription_update: { products: productsOf(f) } } };
    fake.portals.push(c);
    return HttpResponse.json(c);
  }),
  http.post(`${API}/billing_portal/configurations/:id`, async ({ request, params }) => {
    const f = await posted(request, "portal-config-update");
    const c = fake.portals.find((p) => p.id === params.id)!;
    c.features.subscription_update.products = productsOf(f);
    return HttpResponse.json(c);
  }),
  http.post(`${API}/customers`, async ({ request }) => {
    const idem = request.headers.get("idempotency-key");
    if (idem && fake.idem.has(idem)) return HttpResponse.json(fake.idem.get(idem));
    const f = await posted(request, "customers");
    const c = { id: fake.id("cus"), object: "customer", email: f.email, name: f.name, metadata: { account_id: f["metadata[account_id]"] } };
    fake.customers.push(c);
    if (idem) fake.idem.set(idem, c);
    return HttpResponse.json(c);
  }),
  http.post(`${API}/checkout/sessions`, async ({ request }) => {
    const f = await posted(request, "checkout");
    const s = { id: fake.id("cs_test"), object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${fake.n}`, ...f };
    fake.sessions.push(s);
    return HttpResponse.json(s);
  }),
  http.post(`${API}/billing_portal/sessions`, async ({ request }) => {
    const f = await posted(request, "portal");
    return HttpResponse.json({ id: fake.id("bps"), object: "billing_portal.session", url: `https://billing.stripe.com/p/session/${fake.n}`, ...f });
  }),
  http.get(`${API}/subscriptions/:id`, ({ params }) => {
    const s = fake.subs.get(String(params.id));
    return s ? HttpResponse.json(s) : HttpResponse.json({ error: { type: "invalid_request_error", message: "No such subscription" } }, { status: 404 });
  }),
  http.get(`${API}/invoices/:id`, ({ params }) => {
    const i = fake.invoices.get(String(params.id));
    return i ? HttpResponse.json(i) : HttpResponse.json({ error: { type: "invalid_request_error", message: "No such invoice" } }, { status: 404 });
  }),
);

function productsOf(f: Record<string, string>) {
  const out: { product: string; prices: string[] }[] = [];
  for (let i = 0; f[`features[subscription_update][products][${i}][product]`]; i++) {
    out.push({ product: f[`features[subscription_update][products][${i}][product]`]!, prices: [f[`features[subscription_update][products][${i}][prices][0]`]!] });
  }
  return out;
}

const day = 86_400;
const now = () => Math.floor(Date.now() / 1000);
function makeSub(over: Obj & { customer: string; plan: "starter" | "growth" | "scale"; accountId: number }) {
  const price = fake.prices.find((p) => p.lookup_key === lookupKey(over.plan))!;
  const s = {
    id: over.id ?? fake.id("sub"), object: "subscription", customer: over.customer, status: over.status ?? "active",
    cancel_at_period_end: over.cancel_at_period_end ?? false, cancel_at: over.cancel_at ?? null,
    metadata: { account_id: String(over.accountId) },
    items: { object: "list", data: [{ id: fake.id("si"), price, current_period_start: now() - day, current_period_end: now() + 29 * day }] },
  };
  fake.subs.set(s.id, s);
  return s;
}
function makeInvoice(over: { customer: string; status: string; paid: number; due?: number; attempted?: boolean; plan: "starter" | "growth" | "scale" }) {
  const price = fake.prices.find((p) => p.lookup_key === lookupKey(over.plan))!;
  const i = {
    id: fake.id("in"), object: "invoice", customer: over.customer, number: `FW-${fake.n}`, status: over.status,
    attempted: over.attempted ?? true, amount_paid: over.paid, amount_due: over.due ?? over.paid, currency: "usd",
    created: now(), hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: "https://pay.stripe.com/invoice/x/pdf",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_x", metadata: {} } },
    lines: { object: "list", data: [{ id: fake.id("il"), period: { start: now() - day, end: now() + 29 * day },
      pricing: { type: "price_details", price_details: { price: price.id, product: price.product } } }] },
  };
  fake.invoices.set(i.id, i);
  return i;
}
let eventN = 0;
const event = (type: string, object: Obj) => ({ id: `evt_${++eventN}T`, object: "event", type, data: { object } }) as unknown as Stripe.Event;

// ----- Setup -------------------------------------------------------------------------------------------------------
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let stripe: Stripe;
let site: number;
let sends: unknown[] = [];
let refuseSends = false;
let deps: BillingDeps;
let k = 0;

async function newAccount() {
  const r = await signUp(app.db, { email: `owner${++k}@northpine.dental`, name: "Lena Hartmann", company: `Northpine Dental ${k}`, password: "northpine-2026!" });
  if (!r.ok) throw new Error(r.problems.join());
  return { accountId: r.accountId, payer: { accountId: r.accountId, accountName: `Northpine Dental ${k}`, email: `owner${k}@northpine.dental`, name: "Lena Hartmann" } };
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("billing");
  app = createDb(database.appUrl, 3);
  stripe = createStripe("sk_test_fernway123");
  const [s] = await app.db.insert(accounts).values({ name: "Fernway site" }).returning();
  site = s!.id;
  await app.db.insert(routes).values({ accountId: site, key: "customer", label: "Customer", pipelineId: "pipe_sales", stageId: "stage_customer", tags: ["customer"] });
  const engine = testDeps(app.db, null).deps;
  deps = {
    db: app.db,
    stripe,
    sendLead: async (input) => {
      sends.push(input);
      if (refuseSends) return { ok: false, problems: ['route: no route called "customer"'] };
      return ingestLead(engine, site, input);
    },
  };
});
beforeEach(() => { fake.reset(); forgetCatalog(); sends = []; refuseSends = false; });
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await app.pool.end();
  await database.drop();
});

// ----- Tests -------------------------------------------------------------------------------------------------------
describe("the Stripe client", () => {
  it("refuses a live key, so no real money can ever move", () => {
    expect(() => createStripe("sk_live_abc123")).toThrow(/test key/);
    expect(() => createStripe("rk_test_abc123")).toThrow(/test key/);
  });
});

describe("the catalog", () => {
  it("makes each plan's product and monthly USD price by lookup key, and the portal with all three, on a fresh account", async () => {
    const c = await catalog(stripe);
    expect(fake.products.map((p) => p.metadata.fernway_plan)).toEqual(["starter", "growth", "scale"]);
    expect(fake.prices.map((p) => [p.lookup_key, p.unit_amount, p.currency, p.recurring.interval])).toEqual([
      ["fernway_starter_monthly", 1900, "usd", "month"],
      ["fernway_growth_monthly", 4900, "usd", "month"],
      ["fernway_scale_monthly", 14900, "usd", "month"],
    ]);
    expect(Object.values(c.prices)).toEqual(fake.prices.map((p) => p.id));
    expect(fake.portals).toHaveLength(1);
    expect(fake.portals[0]!.features.subscription_update.products.flatMap((p: Obj) => p.prices)).toEqual(fake.prices.map((p) => p.id));
    const cancel = fake.posts.find((p) => p.path === "portal-config")!.form;
    expect(cancel["features[subscription_cancel][mode]"]).toBe("at_period_end");
  });

  it("makes nothing again when everything is there", async () => {
    await catalog(stripe);
    const before = fake.posts.length;
    forgetCatalog();
    await catalog(stripe);
    expect(fake.posts.length).toBe(before);
  });

  it("a price that no longer matches the plan gets a new one that takes over the key, and the portal follows", async () => {
    await catalog(stripe);
    fake.prices.find((p) => p.lookup_key === "fernway_growth_monthly")!.unit_amount = 3900;
    forgetCatalog();
    const c = await catalog(stripe);
    expect(fake.prices).toHaveLength(4);
    expect(fake.prices.filter((p) => p.lookup_key === "fernway_growth_monthly").map((p) => p.unit_amount)).toEqual([4900]);
    const made = fake.posts.filter((p) => p.path === "prices").at(-1)!.form;
    expect(made).toMatchObject({ lookup_key: "fernway_growth_monthly", unit_amount: "4900", transfer_lookup_key: "true" });
    expect(fake.products).toHaveLength(3);
    expect(fake.posts.some((p) => p.path === "portal-config-update")).toBe(true);
    expect(fake.portals[0]!.features.subscription_update.products.flatMap((p: Obj) => p.prices)).toContain(c.prices.growth);
  });
});

describe("starting a plan", () => {
  it("opens Checkout for the plan's price, with the account on it; the customer is made once", async () => {
    const { accountId, payer } = await newAccount();
    const r = await startCheckout(app.db, stripe, payer, "growth", APP);
    expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) });
    const s = fake.posts.find((p) => p.path === "checkout")!.form;
    expect(s).toMatchObject({
      mode: "subscription", client_reference_id: String(accountId), "line_items[0][price]": fake.prices[1]!.id,
      "subscription_data[metadata][account_id]": String(accountId), success_url: `${APP}/account/billing?done=plan-started&paid=1`,
    });
    await startCheckout(app.db, stripe, payer, "starter", APP);
    expect(fake.customers).toHaveLength(1);
    expect(fake.posts.find((p) => p.path === "customers")!.idem).toBe(`fw-customer-${accountId}`);
    const [a] = await app.db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(a!.stripeCustomerId).toBe(fake.customers[0]!.id);
  });

  it("an account that already pays is sent to change its plan instead of paying twice", async () => {
    const { accountId, payer } = await newAccount();
    await catalog(stripe);
    const customer = (await startCheckout(app.db, stripe, payer, "starter", APP), fake.customers[0]!.id);
    const sub = makeSub({ customer, plan: "starter", accountId });
    await handleEvent(deps, event("customer.subscription.created", sub));
    const r = await startCheckout(app.db, stripe, payer, "scale", APP);
    expect(r).toEqual({ ok: false, problem: expect.stringMatching(/already has a plan/) });
  });

  it("the portal opens only for an account that has paid, with Fernway's own portal settings", async () => {
    const { accountId, payer } = await newAccount();
    expect(await startPortal(app.db, stripe, accountId, APP)).toMatchObject({ ok: false });
    await startCheckout(app.db, stripe, payer, "starter", APP);
    const r = await startPortal(app.db, stripe, accountId, APP);
    expect(r).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/billing\.stripe\.com\//) });
    expect(fake.posts.find((p) => p.path === "portal")!.form).toMatchObject({ configuration: fake.portals[0]!.id, return_url: `${APP}/account/billing` });
  });
});

describe("the webhook's signature", () => {
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });
  it("accepts Stripe's own signature for this body", () => {
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
    expect(readEvent(stripe, body, sig, SECRET)?.id).toBe("evt_1");
  });
  it("refuses a changed body, another secret, no signature, and an old signature", () => {
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
    expect(readEvent(stripe, body.replace("invoice.paid", "invoice.void"), sig, SECRET)).toBeNull();
    expect(readEvent(stripe, body, sig, "whsec_another")).toBeNull();
    expect(readEvent(stripe, body, null, SECRET)).toBeNull();
    const old = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET, timestamp: now() - 3600 });
    expect(readEvent(stripe, body, old, SECRET)).toBeNull();
  });
});

describe("events", () => {
  async function paying(plan: "starter" | "growth" | "scale" = "growth") {
    const { accountId, payer } = await newAccount();
    await startCheckout(app.db, stripe, payer, plan, APP);
    const customer = fake.customers.at(-1)!.id;
    const sub = makeSub({ customer, plan, accountId });
    const session = { id: "cs_1", object: "checkout.session", mode: "subscription", client_reference_id: String(accountId), customer, subscription: sub.id };
    return { accountId, customer, sub, session };
  }
  const account = async (id: number) => (await app.db.select().from(accounts).where(eq(accounts.id, id)))[0]!;

  it("Checkout completed: the account gets its plan, status and period, read from Stripe", async () => {
    const { accountId, session, sub } = await paying("growth");
    expect(await handleEvent(deps, event("checkout.session.completed", session))).toBe("done");
    const a = await account(accountId);
    expect(a).toMatchObject({ plan: "growth", billingStatus: "active", stripeSubscriptionId: sub.id, cancelAtPeriodEnd: false });
    expect(a.periodEnd!.getTime()).toBeGreaterThan(Date.now() + 28 * 86_400_000);
  });

  it("the same event twice is done once", async () => {
    const { session } = await paying();
    const e = event("checkout.session.completed", session);
    expect(await handleEvent(deps, e)).toBe("done");
    expect(await handleEvent(deps, e)).toBe("repeat");
    expect(await app.db.select().from(stripeEvents).where(eq(stripeEvents.id, e.id))).toHaveLength(1);
  });

  it("an event's own copy is never trusted: a late 'past due' is replaced by what Stripe says now", async () => {
    const { accountId, sub } = await paying();
    await handleEvent(deps, event("customer.subscription.updated", { ...sub, status: "past_due" }));
    expect((await account(accountId)).billingStatus).toBe("active");
  });

  it("a plan change and a cancel at the period's end are copied", async () => {
    const { accountId, sub } = await paying("starter");
    await handleEvent(deps, event("customer.subscription.created", sub));
    const changed = makeSub({ id: sub.id, customer: sub.customer, plan: "scale", accountId, cancel_at_period_end: true });
    await handleEvent(deps, event("customer.subscription.updated", changed));
    expect(await account(accountId)).toMatchObject({ plan: "scale", cancelAtPeriodEnd: true, billingStatus: "active" });
  });

  it("deleted: the plan ends, so the account can start a new one", async () => {
    const { accountId, sub } = await paying();
    await handleEvent(deps, event("customer.subscription.created", sub));
    fake.subs.set(sub.id, { ...sub, status: "canceled" });
    await handleEvent(deps, event("customer.subscription.deleted", sub));
    expect(await account(accountId)).toMatchObject({ plan: null, billingStatus: "canceled", stripeSubscriptionId: null, periodEnd: null });
  });

  it("an old subscription that ends never overwrites the newer one", async () => {
    const { accountId, customer, sub } = await paying("starter");
    await handleEvent(deps, event("customer.subscription.created", sub));
    const newer = makeSub({ customer, plan: "scale", accountId });
    await handleEvent(deps, event("customer.subscription.created", newer));
    fake.subs.set(sub.id, { ...sub, status: "canceled" });
    await handleEvent(deps, event("customer.subscription.deleted", sub));
    expect(await account(accountId)).toMatchObject({ plan: "scale", stripeSubscriptionId: newer.id, billingStatus: "active" });
  });

  it("the first paid invoice moves the owner to Customer in Fernway's GHL, once, with a receipt", async () => {
    const { accountId, customer, session } = await paying("growth");
    await handleEvent(deps, event("checkout.session.completed", session));
    const first = makeInvoice({ customer, status: "paid", paid: 4900, plan: "growth" });
    await handleEvent(deps, event("invoice.paid", first));
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      idempotencyKey: `stripe-customer-${accountId}`, source: "stripe", route: "customer",
      contact: { firstName: "Lena", lastName: "Hartmann", email: expect.stringMatching(/@northpine\.dental$/), companyName: expect.stringMatching(/^Northpine Dental/),
        message: expect.stringMatching(/^Paid for Fernway Growth: invoice FW-\d+, \$49\.00\. Account AC \d{6}\.$/) },
    });
    const a = await account(accountId);
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, a.customerShipmentId!));
    expect(s).toMatchObject({ accountId: site, source: "stripe", state: "picked_up" });
    const second = makeInvoice({ customer, status: "paid", paid: 4900, plan: "growth" });
    await handleEvent(deps, event("invoice.paid", second));
    expect(sends).toHaveLength(1);
    const rows = await app.db.select().from(stripeInvoices).where(eq(stripeInvoices.accountId, accountId));
    expect(rows.map((r) => [r.status, r.amountCents, r.plan])).toEqual([["paid", 4900, "growth"], ["paid", 4900, "growth"]]);
  });

  it("a $0 invoice moves no one", async () => {
    const { accountId, customer } = await paying();
    await handleEvent(deps, event("invoice.paid", makeInvoice({ customer, status: "paid", paid: 0, plan: "growth" })));
    expect(sends).toHaveLength(0);
    expect((await account(accountId)).customerShipmentId).toBeNull();
  });

  it("a failed payment is kept as an open invoice that was tried and not paid", async () => {
    const { customer } = await paying();
    const inv = makeInvoice({ customer, status: "open", paid: 0, due: 4900, attempted: true, plan: "growth" });
    await handleEvent(deps, event("invoice.payment_failed", inv));
    const [row] = await app.db.select().from(stripeInvoices).where(eq(stripeInvoices.id, inv.id));
    expect(row).toMatchObject({ status: "open", attemptedUnpaid: true, amountCents: 4900 });
    expect(sends).toHaveLength(0);
  });

  it("when the move to Customer can't be made, the event is not marked done, so Stripe sends it again", async () => {
    const { customer } = await paying();
    refuseSends = true;
    const e = event("invoice.paid", makeInvoice({ customer, status: "paid", paid: 4900, plan: "growth" }));
    await expect(handleEvent(deps, e)).rejects.toThrow(/refused/);
    expect(await app.db.select().from(stripeEvents).where(eq(stripeEvents.id, e.id))).toHaveLength(0);
    refuseSends = false;
    expect(await handleEvent(deps, e)).toBe("done");
  });

  it("an event for an account Fernway doesn't know changes nothing and is still answered", async () => {
    await catalog(stripe);
    const stray = makeSub({ customer: "cus_nobody", plan: "starter", accountId: 999999 });
    expect(await handleEvent(deps, event("customer.subscription.created", stray))).toBe("done");
  });

  it("events Fernway doesn't use are left alone", async () => {
    expect(await handleEvent(deps, event("charge.refunded", {}))).toBe("ignored");
  });
});

describe("usage", () => {
  it("counts each lead once, at its first signature, and never a held or returned one", async () => {
    const { accountId } = await newAccount();
    const [route] = await app.db.insert(routes).values({ accountId, key: "trial", label: "Trial" }).returning();
    const ship = async (state: "signed" | "held" | "returned", n: number) => {
      const [s] = await app.db.insert(shipments).values({ accountId, routeId: route!.id, waybillYear: 26, waybillSeq: 90000 + n,
        idempotencyKey: `usage-${accountId}-${n}`, source: "form", contact: { email: "a@b.co" }, state,
        holdReason: state === "held" ? "test" : null }).returning();
      return s!.id;
    };
    const t = (d: number) => new Date(Date.now() - d * 86_400_000);
    const a = await ship("signed", 1);
    await app.db.insert(scans).values([{ shipmentId: a, kind: "signed", at: t(3) }, { shipmentId: a, kind: "signed", at: t(2) }]);
    const b = await ship("signed", 2);
    await app.db.insert(scans).values({ shipmentId: b, kind: "signed", at: t(40) });
    await ship("held", 3);
    await ship("returned", 4);
    expect(await signedBetween(app.db, accountId, t(30), new Date())).toBe(1);
    const v = await billingView(app.db, accountId);
    expect(v).toMatchObject({ plan: null, hasCustomer: false, invoices: [], customerMove: null });
  });
});

describe("the prices", () => {
  it("the site's rate cards show the same prices and leads that Stripe charges", async () => {
    const { readFileSync } = await import("node:fs");
    const rates = readFileSync(new URL("../../../apps/web/src/ui/rates.ts", import.meta.url), "utf8");
    for (const p of Object.values((await import("../src/billing.js")).PLANS)) {
      expect(rates).toContain(`plan: "${p.name}", price: ${p.cents / 100}, leads: ${p.leads},`);
    }
  });
});
