// GHL's webhooks against a real database: only GHL's signature passes, each event counts once, the leads it touches get
// a scan, the public receipt never shows them, and an uninstall disconnects the account.
import { generateKeyPairSync, sign } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditView } from "../src/console.js";
import { forgetOldGhlEvents, ghlEventsFor, handleGhlEvent, verifyGhl } from "../src/ghl-events.js";
import { accounts, ghlConnections, ghlEvents, routes, scans, shipments } from "../src/schema.js";
import { trackView } from "../src/track.js";
import { createDb, freshDatabase } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let owner: ReturnType<typeof createDb>;
let acc: number, other: number, lead: number;
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const signed = (body: object) => { const raw = JSON.stringify(body); return { raw, sig: sign(null, Buffer.from(raw), privateKey).toString("base64") }; };
const send = (body: Record<string, unknown>) => { const { raw } = signed(body); return handleGhlEvent(app.db, raw, body); };

beforeAll(async () => {
  database = await freshDatabase("ghlevents");
  app = createDb(database.appUrl, 2);
  owner = createDb(database.url, 1);
  const [a] = await app.db.insert(accounts).values({ name: "Harbor Physio" }).returning();
  const [b] = await app.db.insert(accounts).values({ name: "Cedar Lane Vets" }).returning();
  acc = a!.id; other = b!.id;
  await app.db.insert(ghlConnections).values([
    { accountId: acc, locationId: "loc_harbor", companyId: "cmp_1", scopes: "x", accessTokenEnc: "x", refreshTokenEnc: "y", expiresAt: new Date(Date.now() + 3_600_000) },
    { accountId: other, locationId: "loc_cedar", companyId: "cmp_2", scopes: "x", accessTokenEnc: "x", refreshTokenEnc: "y", expiresAt: new Date(Date.now() + 3_600_000) },
  ]);
  const [r] = await app.db.insert(routes).values({ accountId: acc, key: "booking", label: "Booking" }).returning();
  const [s] = await app.db.insert(shipments).values({
    accountId: acc, routeId: r!.id, waybillYear: 26, waybillSeq: 41001, idempotencyKey: "ghl-events-1", source: "form",
    contact: { email: "tom@cedarlanevets.com" }, state: "signed", tries: 1, ghlContactId: "c_1", ghlOpportunityId: "o_1", ghlAppointmentId: "a_1",
  }).returning();
  lead = s!.id;
  await app.db.insert(scans).values({ shipmentId: lead, kind: "signed", try: 1 });
});
afterAll(async () => {
  await app.pool.end(); await owner.pool.end();
  await database.drop();
});

describe("GHL's signature", () => {
  it("passes the exact body GHL signed, and nothing else", () => {
    const { raw, sig } = signed({ type: "ContactDelete", id: "c_1" });
    expect(verifyGhl(raw, sig, pem)).toBe(true);
    expect(verifyGhl(raw + " ", sig, pem)).toBe(false);
    expect(verifyGhl(raw, null, pem)).toBe(false);
    expect(verifyGhl(raw, "not-base64-at-all", pem)).toBe(false);
    // Signed by anyone else: refused, even with a well-formed signature.
    const stranger = generateKeyPairSync("ed25519").privateKey;
    expect(verifyGhl(raw, sign(null, Buffer.from(raw), stranger).toString("base64"), pem)).toBe(false);
    // GHL's own published key is the default, and our test key is not it.
    expect(verifyGhl(raw, sig)).toBe(false);
  });
});

describe("events", () => {
  it("scans the lead a deal belongs to, once per event", async () => {
    const ev = { type: "OpportunityStageUpdate", webhookId: "wh_1", locationId: "loc_harbor", id: "o_1", pipelineId: "p", pipelineStageId: "stage_booked" };
    expect(await send(ev)).toMatchObject({ result: "done", leads: 1, summary: "A deal moved to another stage" });
    expect(await send(ev)).toMatchObject({ result: "repeat" });
    await send({ type: "OpportunityStatusUpdate", webhookId: "wh_2", locationId: "loc_harbor", id: "o_1", status: "won" });
    await send({ type: "AppointmentUpdate", webhookId: "wh_3", locationId: "loc_harbor", appointment: { id: "a_1", appointmentStatus: "cancelled" } });
    const list = await app.db.select().from(scans).where(eq(scans.shipmentId, lead));
    expect(list.map((s) => [s.kind, s.note])).toEqual([
      ["signed", null], ["ghl_moved", "moved to stage stage_booked"], ["ghl_moved", "marked won"], ["ghl_changed", "meeting cancelled"],
    ]);
  });

  it("never touches another account's lead with the same GHL id", async () => {
    expect(await send({ type: "ContactDelete", webhookId: "wh_4", locationId: "loc_cedar", id: "c_1" })).toMatchObject({ leads: 0 });
    expect(await send({ type: "ContactDelete", webhookId: "wh_5", locationId: "loc_unknown", id: "c_1" })).toMatchObject({ leads: 0 });
  });

  it("keeps the business's own moves off the public receipt", async () => {
    const t = await trackView(app.db, lead);
    expect(t!.scans.map((s) => s.kind)).toEqual(["signed"]);
  });

  it("disconnects the account when Fernway is uninstalled in GHL, and says so in its audit log", async () => {
    expect(await send({ type: "UNINSTALL", webhookId: "wh_6", appId: "app", locationId: "loc_harbor" })).toMatchObject({ summary: "Fernway uninstalled in GHL: the account is disconnected" });
    expect(await app.db.select().from(ghlConnections).where(eq(ghlConnections.accountId, acc))).toEqual([]);
    expect(await app.db.select().from(ghlConnections).where(eq(ghlConnections.accountId, other))).toHaveLength(1);
    expect((await auditView(app.db, acc)).rows[0]).toMatchObject({ who: "GHL", action: "ghl.disconnected", userId: null });
    const events = await ghlEventsFor(app.db, acc);
    expect(events.map((e) => e.type)).toEqual(["UNINSTALL", "AppointmentUpdate", "OpportunityStatusUpdate", "OpportunityStageUpdate"]);
  });

  it("forgets events after 30 days", async () => {
    await owner.db.update(ghlEvents).set({ receivedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(ghlEvents.webhookId, "wh_1"));
    expect(await forgetOldGhlEvents(app.db)).toBe(1);
  });
});
