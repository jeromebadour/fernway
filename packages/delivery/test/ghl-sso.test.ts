// Fernway's page inside GHL: GHL's encrypted user opens only with the shared secret, in CryptoJS's exact format, and
// only a sub-account connected to Fernway gets a ticket, for that account alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keyFrom } from "../src/crypto.js";
import { ghlAppSession, ghlAppWho, openGhlUser, sealGhlUser } from "../src/ghl-sso.js";
import { accounts, ghlConnections } from "../src/schema.js";
import { createDb, freshDatabase } from "./support.js";

const secret = "fernway-test-secret";
// Made by CryptoJS 4 itself: CryptoJS.AES.encrypt(JSON.stringify(user), secret).toString(), as GHL does.
const fromCryptoJs = "U2FsdGVkX18LoaCIc2T1siTYCTDOn0T6ybDVbZ6Cb/o2i+o+9i38DSOe8/HS6Lv+eSrkZQZyWSbQ21QFmwx0kQ4wZN/uLiz+zxZjzxVm63HXWjc5GwLAgvw/wPMNCXoRU7Iw8kIJOii4VtOIbQ1SluZVDB1obrQr+iCov+a4O37FDg3pHbiouKUMwIIgrjy9lxZrKDUL9JnQ9ZiH2VZ5A7jeAvUY9C7AD8jUVzHIA+uSxfw05dnEfdCH+AflfX3L";
const key = keyFrom("0000000000000000000000000000000000000000000000000000000000000002");

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let harbor: number;
beforeAll(async () => {
  database = await freshDatabase("ghlsso");
  app = createDb(database.appUrl, 2);
  const [a] = await app.db.insert(accounts).values({ name: "Harbor Physio" }).returning();
  harbor = a!.id;
  await app.db.insert(ghlConnections).values({ accountId: harbor, locationId: "loc_harbor", scopes: "x", accessTokenEnc: "x", refreshTokenEnc: "y", expiresAt: new Date(Date.now() + 3_600_000) });
});
afterAll(async () => { await app.pool.end(); await database.drop(); });

describe("GHL's encrypted user", () => {
  it("opens what CryptoJS made, with the right secret only", () => {
    expect(openGhlUser(fromCryptoJs, secret)).toMatchObject({ userId: "usr_ci", activeLocation: "loc_harbor", userName: "Maya Lindqvist" });
    expect(openGhlUser(fromCryptoJs, "another-secret")).toBeNull();
    expect(openGhlUser(fromCryptoJs.slice(0, -8) + "AAAAAAAA", secret)).toBeNull();
    expect(openGhlUser("not base64 at all", secret)).toBeNull();
    expect(openGhlUser(sealGhlUser({ role: "admin" }, secret), secret)).toBeNull(); // no userId: not a GHL user
    expect(openGhlUser(sealGhlUser({ userId: "u2", activeLocation: "l" }, secret), secret)).toMatchObject({ userId: "u2" });
  });
});

describe("the page's session", () => {
  it("gives a ticket for a connected sub-account, and nothing otherwise", async () => {
    const s = await ghlAppSession(app.db, key, fromCryptoJs, secret);
    expect(s).toMatchObject({ ok: true, accountName: "Harbor Physio", who: { accountId: harbor, name: "Maya Lindqvist", location: "loc_harbor" } });
    if (s.ok) {
      expect(ghlAppWho(key, s.ticket)).toMatchObject({ accountId: harbor });
      expect(ghlAppWho(keyFrom("0000000000000000000000000000000000000000000000000000000000000003"), s.ticket)).toBeNull();
      // One changed character of the signature (the first: every bit of it counts, unlike the last one's).
      const [body, sig] = s.ticket.split(".");
      expect(ghlAppWho(key, `${body}.${sig![0] === "A" ? "B" : "A"}${sig!.slice(1)}`)).toBeNull();
      expect(ghlAppWho(key, `${body!.slice(0, -2)}xx.${sig}`)).toBeNull();
    }
    expect(await ghlAppSession(app.db, key, sealGhlUser({ userId: "u", activeLocation: "loc_other" }, secret), secret)).toEqual({ ok: false, why: "not-connected" });
    expect(await ghlAppSession(app.db, key, sealGhlUser({ userId: "u", type: "agency", companyId: "c" }, secret), secret)).toEqual({ ok: false, why: "agency" });
    expect(await ghlAppSession(app.db, key, fromCryptoJs, "wrong")).toEqual({ ok: false, why: "payload" });
  });
});
