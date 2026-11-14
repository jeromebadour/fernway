// Stripe payments in, against a real database: only the account's own Stripe (its secret, recent) is heard; a paid
// checkout becomes one lead on the chosen route, however often Stripe sends it; an unpaid one waits; a plan without
// payments pauses the link (403, so Stripe keeps the event) and never loses it; owners and admins link, others don't.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keyFrom } from "../src/crypto.js";
import { ingestLead } from "../src/engine.js";
import { accounts, auditLog, shipments, stripeLinks } from "../src/schema.js";
import { linkStripe, paymentLead, receiveStripe, stripeInView, stripeLinkView, stripeSigned, stripeToken, unlinkStripe } from "../src/stripe-in.js";
import { createDb, freshDatabase, seedAccount, testDeps } from "./support.js";

const key = keyFrom("cd".repeat(32));
const SECRET = "whsec_test_Northpine0123456789abcdef";
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;
let token = "";
const owner = () => ({ accountId: acc, userId: null, name: "Lena Hartmann", role: "owner" as const });
const deps = () => ({ db: app.db, key, sendLead: (id: number, input: unknown) => ingestLead(testDeps(app.db, null).deps, id, input) });

const stripeHeader = (secret: string, body: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const checkout = (id: string, over: Record<string, unknown> = {}, type = "checkout.session.completed") => JSON.stringify({
  id: `evt_${id}`, type,
  data: { object: {
    id: `cs_test_${id}`, object: "checkout.session", payment_status: "paid", amount_total: 4900, currency: "usd",
    customer_details: { name: "Dana Whitfield", email: "dana@northpine.com", phone: "+1 (503) 555-0142", business_name: "Northpine Dental",
      address: { line1: "14 Cedar Ln", city: "Portland", state: "OR", postal_code: "97201", country: "US" } },
    ...over,
  } },
});

beforeAll(async () => {
  database = await freshDatabase("stripein");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
});
afterAll(async () => { await app.pool.end(); await database.drop(); });

describe("the signature", () => {
  it("is Stripe's way: any v1 under the secret, no older than 300 s", () => {
    const body = '{"a":1}';
    const now = 1_800_000_000;
    expect(stripeSigned(SECRET, body, stripeHeader(SECRET, body, now), now)).toBe(true);
    expect(stripeSigned(SECRET, body, `${stripeHeader("whsec_other", body, now)},v1=${stripeHeader(SECRET, body, now).split("v1=")[1]}`, now)).toBe(true);
    expect(stripeSigned(SECRET, body, stripeHeader("whsec_other", body, now), now)).toBe(false);
    expect(stripeSigned(SECRET, '{"a":2}', stripeHeader(SECRET, body, now), now)).toBe(false);
    expect(stripeSigned(SECRET, body, stripeHeader(SECRET, body, now - 301), now)).toBe(false);
    expect(stripeSigned(SECRET, body, null, now)).toBe(false);
    expect(stripeSigned(SECRET, body, `t=${now}`, now)).toBe(false);
  });
});

describe("linking", () => {
  it("takes a whsec_ secret and a route that books nothing, from the owner or an admin only", async () => {
    expect(await linkStripe(app.db, key, { ...owner(), role: "member" }, { secret: SECRET, route: "trial" })).toMatchObject({ ok: false });
    expect(await linkStripe(app.db, key, owner(), { secret: "sk_test_nope", route: "demo" })).toEqual({ ok: false, problems: [
      "secret: the webhook's signing secret from Stripe, starting whsec_",
      "route: a route without a meeting time (a payment books nothing)",
    ] });
    expect(await linkStripe(app.db, key, owner(), { secret: SECRET, route: "nowhere" })).toEqual({ ok: false, problems: ["route: one of this account's routes"] });
    const r = await linkStripe(app.db, key, owner(), { secret: SECRET, route: "trial" });
    expect(r).toMatchObject({ ok: true });
    token = (r as { token: string }).token;
    expect(token).toMatch(/^stin_[A-Za-z0-9_-]{24}$/);
    expect(token).toBe(stripeToken(key, acc));
    expect(stripeToken(key, acc + 1)).not.toBe(token);
    expect((await stripeInView(app.db, key, acc, "https://fernway.test/")).address).toBe(`https://fernway.test/api/stripe/in/${token}`);
    const [row] = await app.db.select().from(stripeLinks).where(eq(stripeLinks.accountId, acc));
    expect(row!.secretSealed).not.toContain("whsec_");
    // A change keeps the address; a blank secret keeps the one kept.
    expect(await linkStripe(app.db, key, owner(), { secret: "", route: "contact-only" })).toEqual({ ok: true, token });
    expect((await stripeLinkView(app.db, acc))!).toMatchObject({ routeKey: "contact-only", routeLabel: "Newsletter" });
    await linkStripe(app.db, key, owner(), { route: "trial" });
    const acts = (await app.db.select({ a: auditLog.action }).from(auditLog).where(eq(auditLog.accountId, acc))).map((x) => x.a);
    expect(acts.filter((a) => a.startsWith("stripe."))).toEqual(["stripe.linked", "stripe.changed", "stripe.changed"]);
  });
});

describe("Stripe's call", () => {
  it("turns a paid checkout into one lead, however often Stripe sends it", async () => {
    const body = checkout("A1");
    const first = await receiveStripe(deps(), token, body, stripeHeader(SECRET, body));
    expect(first).toMatchObject({ status: 200, body: { ok: true, result: "picked up" } });
    const again = await receiveStripe(deps(), token, body, stripeHeader(SECRET, body));
    expect(again).toMatchObject({ status: 200, body: { ok: true, result: "already picked up", waybill: first.body.waybill } });
    // The async "succeeded" for the same checkout is the same lead too.
    const late = checkout("A1", {}, "checkout.session.async_payment_succeeded");
    expect((await receiveStripe(deps(), token, late, stripeHeader(SECRET, late))).body.waybill).toBe(first.body.waybill);
    const rows = await app.db.select().from(shipments).where(eq(shipments.idempotencyKey, "stripe-cs_test_A1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "stripe" });
    expect(rows[0]!.contact).toMatchObject({
      firstName: "Dana", lastName: "Whitfield", email: "dana@northpine.com", phone: "+15035550142", companyName: "Northpine Dental",
      address: { line1: "14 Cedar Ln", city: "Portland", state: "OR", postalCode: "97201", country: "US" },
      message: "Paid 49.00 USD through Stripe (checkout cs_test_A1).",
    });
    expect((await stripeLinkView(app.db, acc))!.lastResult).toMatch(/^checkout cs_test_A1 picked up as FW /);
  });

  it("hears only its own Stripe, and leaves alone what isn't a paid checkout", async () => {
    const body = checkout("B1");
    expect((await receiveStripe(deps(), token, body, stripeHeader("whsec_someone_else_0123456789", body))).status).toBe(400);
    expect((await receiveStripe(deps(), "stin_nobodyhere0123456789abcd", body, stripeHeader(SECRET, body))).status).toBe(404);
    const other = JSON.stringify({ id: "evt_x", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } });
    expect(await receiveStripe(deps(), token, other, stripeHeader(SECRET, other))).toEqual({ status: 200, body: { ok: true, result: "ignored: invoice.paid" } });
    const unpaid = checkout("B2", { payment_status: "unpaid" });
    expect((await receiveStripe(deps(), token, unpaid, stripeHeader(SECRET, unpaid))).body.result).toBe("not paid yet");
    expect(await app.db.select().from(shipments).where(eq(shipments.idempotencyKey, "stripe-cs_test_B2"))).toHaveLength(0);
  });

  it("says why when the payment can't be a lead, and stops Stripe trying the same thing again", async () => {
    const body = checkout("C1", { customer_details: { name: "No Contact" } });
    const r = await receiveStripe(deps(), token, body, stripeHeader(SECRET, body));
    expect(r).toEqual({ status: 200, body: { ok: false, result: "refused: contact: an email or a phone number, so GHL can match the contact" } });
    expect((await stripeLinkView(app.db, acc))!.lastResult).toBe("checkout cs_test_C1 refused: contact: an email or a phone number, so GHL can match the contact");
  });

  it("is paused, not lost, on a plan without Stripe payments: 403, so Stripe keeps the event", async () => {
    await app.db.update(accounts).set({ plan: "starter", billingStatus: "active", trialEndsAt: new Date(Date.now() - 86_400_000) }).where(eq(accounts.id, acc));
    const body = checkout("D1");
    const r = await receiveStripe(deps(), token, body, stripeHeader(SECRET, body));
    expect(r.status).toBe(403);
    expect(r.body.result).toBe("plan: Stripe payments are on the Growth plan. Starter doesn't include it: pick a plan in Plan and billing.");
    expect(await linkStripe(app.db, key, owner(), { route: "trial" })).toMatchObject({ ok: false });
    // Moving up brings it back as it was: the same address, the event Stripe sends again picked up.
    await app.db.update(accounts).set({ plan: "growth" }).where(eq(accounts.id, acc));
    expect((await receiveStripe(deps(), token, body, stripeHeader(SECRET, body))).body.result).toBe("picked up");
  });

  it("unlinking refuses Stripe's calls to the old address", async () => {
    expect(await unlinkStripe(app.db, { ...owner(), role: "member" })).toBe(false);
    expect(await unlinkStripe(app.db, owner())).toBe(true);
    const body = checkout("E1");
    expect((await receiveStripe(deps(), token, body, stripeHeader(SECRET, body))).status).toBe(404);
  });
});

describe("the lead", () => {
  it("keeps what Stripe gave, drops a phone GHL can't take, and still names the payment", () => {
    const l = paymentLead({ id: "cs_1", amount_total: 1999, currency: "eur", customer_details: { email: "a@b.co", phone: "12", name: "Cher" } }, "trial");
    expect(l.contact).toEqual({ firstName: "Cher", email: "a@b.co", message: "Paid 19.99 EUR through Stripe (checkout cs_1)." });
  });
});
