import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signValue } from "../src/crypto.js";
import { deliverTry, ingestLead } from "../src/engine.js";
import { findWaybill, maskEmail, readTrackToken, trackToken, trackView } from "../src/track.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const key = randomBytes(32);
let database: Awaited<ReturnType<typeof freshDatabase>>;
let handle: ReturnType<typeof createDb>;
let accountId: number;
const ghl = fakeGhl();

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("track");
  handle = createDb(database.appUrl, 2);
  const owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
  await owner.pool.end();
});
afterAll(async () => {
  ghl.server.close();
  await handle.pool.end();
  await database.drop();
});

describe("the public tracking receipt", () => {
  it("opens only with a link we signed for that shipment, for 30 days", () => {
    const t = trackToken(key, 42);
    expect(readTrackToken(key, t)).toBe(42);
    expect(readTrackToken(randomBytes(32), t)).toBeNull();
    expect(readTrackToken(key, t.slice(0, -3) + "abc")).toBeNull();
    // A value signed for another purpose (the connect state) is not a tracking link.
    expect(readTrackToken(key, signValue(key, "connect", { s: 42 }, 60_000))).toBeNull();
    expect(readTrackToken(key, signValue(key, "track", { s: 42 }, -1))).toBeNull();
  });

  it("masks the email", () => {
    expect(maskEmail("lena@northpine.example")).toBe("l•••@northpine.example");
    expect(maskEmail(undefined)).toBeNull();
  });

  it("shows the waybill and its scans, but not what was sent or GHL's ids", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, {
      idempotencyKey: "track-0001", source: "form", route: "trial",
      contact: { firstName: "Lena", lastName: "Hartmann", email: "lena@northpine.example", companyName: "Northpine Dental" },
    });
    if (!r.ok) throw new Error(r.problems.join());
    await deliverTry(deps, r.waybill.id, 1);
    const v = (await trackView(handle.db, r.waybill.id))!;
    expect(v.number).toBe(r.waybill.number);
    expect(v.state).toBe("signed");
    expect(v.consignee).toEqual({ firstName: "Lena", lastName: "Hartmann", company: "Northpine Dental", email: "l•••@northpine.example" });
    expect(v.scans.map((s) => s.kind)).toEqual(["picked_up", "checked", "handed", "signed"]);
    const text = JSON.stringify(v);
    expect(text).not.toContain("lena@");
    expect(text).not.toMatch(/"sent"|ghlContactId|c_\d|o_\d/);
    expect(await trackView(handle.db, 999999)).toBeNull();
  });

  it("finds a waybill again only by its number and the email it was sent with, in its own account", async () => {
    const { deps } = testDeps(handle.db, fakeConnection());
    const r = await ingestLead(deps, accountId, { idempotencyKey: "find-0001", source: "form", route: "trial", contact: { email: "mara@harborline.example" } });
    if (!r.ok) throw new Error();
    const dashed = r.waybill.number.replace(/ /g, "-").toLowerCase();
    expect(await findWaybill(handle.db, accountId, r.waybill.number, "mara@harborline.example")).toBe(r.waybill.id);
    // Typed loosely: dashes, small letters, spaces and capitals in the email.
    expect(await findWaybill(handle.db, accountId, dashed, "  Mara@Harborline.example ")).toBe(r.waybill.id);
    expect(await findWaybill(handle.db, accountId, r.waybill.number, "someone@else.example")).toBeNull();
    expect(await findWaybill(handle.db, accountId + 999, r.waybill.number, "mara@harborline.example")).toBeNull();
    expect(await findWaybill(handle.db, accountId, "FW 26", "mara@harborline.example")).toBeNull();
  });
});
