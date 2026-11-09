import { eq } from "drizzle-orm";
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { open, seal, signValue, verifyValue } from "../src/crypto.js";
import { deliverTry, ingestLead } from "../src/engine.js";
import { createGhlClient, ReconnectNeeded } from "../src/ghl.js";
import { authorizeUrl, completeConnect, connectState, connectionFor, readConnectState, type OAuthConfig } from "../src/oauth.js";
import { ghlConnections, shipments } from "../src/schema.js";
import { createDb, freshDatabase, GHL_BASE, seedAccount } from "./support.js";

const key = randomBytes(32);
const cfg: OAuthConfig = { clientId: "6af24287e841246f14ab4de7-mw9tde3s", clientSecret: "test-secret", redirectUri: "https://fernway.test/api/connect/callback", key, apiBase: GHL_BASE };

// The fake token endpoint: hands out numbered tokens, remembers what it was asked, refuses a spent refresh token.
const calls: { grant: string; body: Record<string, string>; json: boolean }[] = [];
let issued = 0;
const spent = new Set<string>();
let refuseRefresh = false;
const server = setupServer(
  http.post(`${GHL_BASE}/oauth/token`, async ({ request }) => {
    const json = (request.headers.get("content-type") ?? "").includes("json");
    const body = json ? ((await request.json()) as Record<string, string>) : Object.fromEntries(new URLSearchParams(await request.text()));
    calls.push({ grant: body.grant_type!, body, json });
    if (body.grant_type === "refresh_token") {
      await delay(80);
      if (refuseRefresh || spent.has(body.refresh_token!)) return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
      spent.add(body.refresh_token!);
    }
    issued += 1;
    return HttpResponse.json({
      access_token: `access-${issued}`,
      refresh_token: `refresh-${issued}`,
      expires_in: 86400,
      scope: "contacts.write contacts.readonly",
      locationId: body.code === "agency-code" ? undefined : "loc_sandbox",
      companyId: "company_1",
      userType: "Location",
    });
  }),
  http.post(`${GHL_BASE}/contacts/upsert`, () => HttpResponse.json({ contact: { id: "c_1" } })),
);

let database: Awaited<ReturnType<typeof freshDatabase>>;
let handle: ReturnType<typeof createDb>;
let accountId: number;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  database = await freshDatabase("oauth");
  handle = createDb(database.appUrl, 4);
  const owner = createDb(database.url, 1);
  accountId = await seedAccount(owner.db);
  await owner.pool.end();
});
afterAll(async () => {
  server.close();
  await handle.pool.end();
  await database.drop();
});
beforeEach(() => {
  calls.length = 0;
  refuseRefresh = false;
});

const expire = () => handle.db.update(ghlConnections).set({ expiresAt: new Date(Date.now() - 1000), refreshedAt: null }).where(eq(ghlConnections.accountId, accountId));

describe("secrets and signatures", () => {
  it("seals tokens so the stored value reveals nothing and can't be altered", () => {
    const sealed = seal(key, "access-abc");
    expect(sealed).not.toContain("access-abc");
    expect(open(key, sealed)).toBe("access-abc");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(key, parts.join("."))).toThrow();
    expect(() => open(randomBytes(32), sealed)).toThrow();
  });

  it("accepts a connect state only if it is ours, unaltered and not expired", () => {
    const state = connectState(cfg, 7);
    expect(readConnectState(cfg, state)?.accountId).toBe(7);
    expect(readConnectState(cfg, state.slice(0, -2) + "xx")).toBeNull();
    expect(readConnectState({ ...cfg, key: randomBytes(32) }, state)).toBeNull();
    expect(verifyValue(key, "connect", signValue(key, "connect", { accountId: 7 }, -1))).toBeNull();
    // A value signed for another purpose is not a connect state.
    expect(readConnectState(cfg, signValue(key, "other", { accountId: 7 }, 60_000))).toBeNull();
  });

  it("builds the install link the app's Auth page shows, with our state", () => {
    const u = new URL(authorizeUrl(cfg, "STATE"));
    expect(u.origin + u.pathname).toBe("https://marketplace.gohighlevel.com/v2/oauth/chooselocation");
    expect(u.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(u.searchParams.get("version_id")).toBe("6af24287e841246f14ab4de7");
    expect(u.searchParams.get("scope")!.split(" ")).toHaveLength(10);
    expect(u.searchParams.get("state")).toBe("STATE");
  });
});

describe("connecting and staying connected", () => {
  it("swaps the code for tokens and keeps them encrypted", async () => {
    const r = await completeConnect(handle.db, cfg, "code-1", accountId);
    expect(r.locationId).toBe("loc_sandbox");
    const [c] = calls;
    expect(c).toMatchObject({ grant: "authorization_code", json: true });
    expect(c!.body).toMatchObject({ code: "code-1", user_type: "Location", redirect_uri: cfg.redirectUri, client_id: cfg.clientId });
    const [row] = await handle.db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
    expect(row!.accessTokenEnc).not.toContain("access-");
    expect(row!.refreshTokenEnc).not.toContain("refresh-");
    expect(row!.status).toBe("connected");
  });

  it("refuses an agency-level connection: Fernway works per sub-account", async () => {
    const other = createDb(database.url, 1);
    const otherAccount = await seedAccountNamed(other, "Second account");
    await expect(completeConnect(handle.db, cfg, "agency-code", otherAccount)).rejects.toThrow(/pick a sub-account/);
    await other.pool.end();
  });

  it("uses the stored token while it is fresh, without asking GHL", async () => {
    await completeConnect(handle.db, cfg, "code-2", accountId);
    calls.length = 0;
    const conn = await connectionFor(handle.db, cfg, accountId);
    expect(await conn!.accessToken()).toMatch(/^access-/);
    expect(calls).toHaveLength(0);
  });

  it("refreshes an expired token once, form-encoded, and keeps the new refresh token", async () => {
    await completeConnect(handle.db, cfg, "code-3", accountId);
    await expire();
    calls.length = 0;
    const conn = await connectionFor(handle.db, cfg, accountId);
    const first = await conn!.accessToken();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ grant: "refresh_token", json: false });
    // Next expiry spends the new refresh token, not the old one (GHL refuses a spent one).
    await expire();
    const second = await conn!.accessToken();
    expect(second).not.toBe(first);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.refresh_token).not.toBe(calls[0]!.body.refresh_token);
  });

  it("spends the single-use refresh token once even when two workers need a token at the same moment", async () => {
    await completeConnect(handle.db, cfg, "code-4", accountId);
    await expire();
    calls.length = 0;
    const [a, b] = await Promise.all([
      connectionFor(handle.db, cfg, accountId).then((c) => c!.accessToken()),
      connectionFor(handle.db, cfg, accountId).then((c) => c!.accessToken()),
    ]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.grant === "refresh_token")).toHaveLength(1);
  });

  it("marks the connection for reconnecting when GHL refuses the refresh, and holds leads with that reason", async () => {
    await completeConnect(handle.db, cfg, "code-5", accountId);
    await expire();
    refuseRefresh = true;
    const conn = await connectionFor(handle.db, cfg, accountId);
    await expect(conn!.accessToken()).rejects.toBeInstanceOf(ReconnectNeeded);
    const [row] = await handle.db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
    expect(row!.status).toBe("needs_reconnect");
    expect(row!.lastError).toContain("400");

    const deps = {
      db: handle.db,
      ghl: createGhlClient({ baseUrl: GHL_BASE }),
      connectionFor: (id: number) => connectionFor(handle.db, cfg, id),
      schedule: async () => {},
    };
    const r = await ingestLead(deps, accountId, { idempotencyKey: "reconnect-0001", source: "api", route: "trial", contact: { email: "x@y.example" } });
    if (!r.ok) throw new Error();
    expect(await deliverTry(deps, r.waybill.id, 1)).toBe("held");
    const [s] = await handle.db.select().from(shipments).where(eq(shipments.id, r.waybill.id));
    expect(s!.holdReason).toContain("needs reconnecting");

    // Reconnecting clears it.
    await completeConnect(handle.db, cfg, "code-6", accountId);
    const [after] = await handle.db.select().from(ghlConnections).where(eq(ghlConnections.accountId, accountId));
    expect(after!.status).toBe("connected");
    expect(after!.lastError).toBeNull();
  });
});

async function seedAccountNamed(h: ReturnType<typeof createDb>, name: string) {
  const { accounts } = await import("../src/schema.js");
  const [a] = await h.db.insert(accounts).values({ name }).returning();
  return a!.id;
}
