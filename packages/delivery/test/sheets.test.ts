// Google Sheets against a real database and a fake Google (signed sign-in, sheets kept in memory): a sheet links only
// when shared with Fernway, gets its tab and header once; each lead is one row, rewritten when it changes and found
// again by its waybill when someone sorts the sheet; a sheet that is unshared stops the run and is retried.
import { createVerify, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { auditLog, leadScores, sheetLinks, sheetRows, shipments } from "../src/schema.js";
import { createSheets, linkSheet, rowOf, serviceKeyFrom, sheetIdFrom, sheetView, syncSheets, unlinkSheet, SHEET_HEADER, SHEET_TAB } from "../src/sheets.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const GOOGLE = "http://sheets.fake";
const TOKEN = "http://oauth.fake/token";
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xy";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = { client_email: "fernway-sheets@fernway-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };

// The fake Google: one spreadsheet per id, each tab a grid of rows; shared or not.
const books = new Map<string, { title: string; shared: boolean; tabs: Map<string, string[][]> }>();
let signIns = 0;
const range = (r: string) => {
  const m = decodeURIComponent(r).match(/^'(.+)'!A(\d*)(?::[A-Z](\d*))?$/);
  return { tab: m![1]!.replace(/''/g, "'"), from: m![2] ? Number(m![2]) : null };
};
const google = [
  http.post(TOKEN, async ({ request }) => {
    const jwt = new URLSearchParams(await request.text()).get("assertion")!;
    const [h, p, sig] = jwt.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig!, "base64url"));
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    if (!ok || claims.iss !== key.client_email || !claims.scope.includes("spreadsheets")) return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    signIns++;
    return HttpResponse.json({ access_token: "ya29.fake", expires_in: 3600 });
  }),
  http.all(`${GOOGLE}/v4/spreadsheets/:rest*`, async ({ request, params }) => {
    if (request.headers.get("authorization") !== "Bearer ya29.fake") return HttpResponse.json({ error: { message: "unauthenticated" } }, { status: 401 });
    const parts = (params.rest as string[]);
    const [idPart, what, r] = [parts[0]!, parts[1], parts[2]];
    const [id, op] = idPart.split(":");
    const book = books.get(id!);
    if (!book) return HttpResponse.json({ error: { message: "Requested entity was not found." } }, { status: 404 });
    if (!book.shared) return HttpResponse.json({ error: { message: "The caller does not have permission" } }, { status: 403 });
    const body = request.method === "GET" ? null : (await request.json()) as Record<string, unknown>;
    if (!what && op === "batchUpdate") {
      const title = (body!.requests as { addSheet: { properties: { title: string } } }[])[0]!.addSheet.properties.title;
      book.tabs.set(title, []);
      return HttpResponse.json({});
    }
    if (!what) return HttpResponse.json({ properties: { title: book.title }, sheets: [...book.tabs.keys()].map((t) => ({ properties: { title: t } })) });
    const verb = r!.endsWith(":append") ? "append" : null;
    const rng = verb ? r!.slice(0, -":append".length) : r!;
    const { tab, from } = range(rng!);
    const grid = book.tabs.get(tab)!;
    if (verb === "append") {
      grid.push((body!.values as string[][])[0]!);
      return HttpResponse.json({ updates: { updatedRange: `'${tab}'!A${grid.length}:L${grid.length}` } });
    }
    if (request.method === "PUT") { grid[from! - 1] = (body!.values as string[][])[0]!; return HttpResponse.json({}); }
    if (from) return HttpResponse.json({ values: grid[from - 1] ? [[grid[from - 1]![0]]] : [] });
    return HttpResponse.json({ values: grid.map((g) => [g[0]]) });
  }),
];

const ghl = fakeGhl();
let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;
let sheets: ReturnType<typeof createSheets>;
const owner = () => ({ accountId: acc, userId: null, name: "Lena Hartmann", role: "owner" as const });
const conn = fakeConnection();
async function send(k: string) {
  const { deps } = testDeps(app.db, conn);
  const r = await ingestLead(deps, acc, { idempotencyKey: `sheet-${k}-0001`, source: "form", route: "trial", contact: { firstName: "Lena", lastName: "Hartmann", email: `${k}@northpine.com`, message: "=HYPERLINK(\"http://evil\")" } });
  if (!r.ok) throw new Error(r.problems.join(", "));
  return { id: r.waybill.id, number: r.waybill.number, deps };
}
const grid = () => books.get(ID)!.tabs.get(SHEET_TAB)!;

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  ghl.server.use(...google);
  sheets = createSheets({ key, baseUrl: GOOGLE, tokenUrl: TOKEN, timeoutMs: 500 });
  database = await freshDatabase("sheets");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
});
afterAll(async () => { ghl.server.close(); await app.pool.end(); await database.drop(); });
beforeEach(() => ghl.reset());

describe("the key and the link", () => {
  it("reads the service account key and the sheet's id from its link", () => {
    expect(serviceKeyFrom(Buffer.from(JSON.stringify({ type: "service_account", ...key })).toString("base64"))?.client_email).toBe(key.client_email);
    expect(serviceKeyFrom(Buffer.from('{"type":"authorized_user"}').toString("base64"))).toBeNull();
    expect(serviceKeyFrom("not base64 json")).toBeNull();
    expect(sheetIdFrom(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(sheetIdFrom(ID)).toBe(ID);
    expect(sheetIdFrom("https://example.com/sheet")).toBeNull();
  });

  it("links only a sheet shared with Fernway, makes its tab and header, audited; a member may not", async () => {
    books.set(ID, { title: "Northpine leads", shared: false, tabs: new Map([["Sheet1", []]]) });
    expect(await linkSheet(app.db, sheets, { ...owner(), role: "member" }, ID)).toMatchObject({ ok: false });
    expect(await linkSheet(app.db, sheets, owner(), "https://docs.google.com/spreadsheets/d/1nOpEnOpEnOpEnOpEnOpEnOpE/edit")).toEqual({ ok: false, problems: [`sheet: Fernway can't open it. Share it with ${key.client_email} as an Editor, then try again`] });
    expect(await linkSheet(app.db, sheets, owner(), ID)).toMatchObject({ ok: false, problems: [expect.stringContaining("Share it with")] });
    books.get(ID)!.shared = true;
    expect(await linkSheet(app.db, sheets, owner(), `https://docs.google.com/spreadsheets/d/${ID}/edit`)).toEqual({ ok: true, title: "Northpine leads" });
    expect(grid()).toEqual([SHEET_HEADER]);
    expect(signIns).toBe(1);
    const [a] = await app.db.select().from(auditLog).where(eq(auditLog.action, "sheet.linked"));
    expect(a).toMatchObject({ targetKind: "sheet", targetId: "Northpine leads" });
  });
});

describe("rows", () => {
  it("writes each new lead once, as text, and rewrites its row when it changes", async () => {
    const a = await send("first");
    const b = await send("second");
    const r0 = await syncSheets({ db: app.db, sheets });
    expect(r0).toMatchObject({ written: 2, updated: 0 });
    expect(grid()).toHaveLength(3);
    expect(grid()[1]!.slice(0, 4)).toEqual([a.number, expect.any(String), "Lena Hartmann", "first@northpine.com"]);
    expect(grid()[1]![8]).toBe("Picked up");
    // Nothing changed: nothing is sent again.
    expect(await syncSheets({ db: app.db, sheets })).toMatchObject({ written: 0, updated: 0 });
    // Signed for, then scored: the same row is rewritten.
    await deliverTry(a.deps, a.id, 1);
    await app.db.insert(leadScores).values({ shipmentId: a.id, accountId: acc, state: "scored", score: 5, summary: "Ready to start.", scoredAt: new Date(Date.now() + 1000) });
    expect(await syncSheets({ db: app.db, sheets })).toMatchObject({ updated: 1 });
    expect(grid()).toHaveLength(3);
    expect(grid()[1]!.slice(8, 11)).toEqual(["Signed for", "5", "Ready to start."]);
    expect(grid()[2]![0]).toBe(b.number);
  });

  it("finds a row again by its waybill after the sheet was sorted, and appends one that was deleted", async () => {
    const [, r1, r2] = grid();
    books.get(ID)!.tabs.set(SHEET_TAB, [SHEET_HEADER, r2!, r1!]);
    const [second] = await app.db.select().from(shipments).where(eq(shipments.contact, { firstName: "Lena", lastName: "Hartmann", email: "second@northpine.com", message: "=HYPERLINK(\"http://evil\")" }));
    await app.db.update(shipments).set({ state: "held", holdReason: "GHL said 422", updatedAt: new Date(Date.now() + 2000) }).where(eq(shipments.id, second!.id));
    await syncSheets({ db: app.db, sheets });
    expect(grid()[1]![8]).toBe("Held");
    expect(grid()[2]![8]).toBe("Signed for");
    const [row] = await app.db.select().from(sheetRows).where(eq(sheetRows.shipmentId, second!.id));
    expect(row!.rowNumber).toBe(2);
    // Deleted by hand: the next change writes it back as a new row.
    books.get(ID)!.tabs.set(SHEET_TAB, [SHEET_HEADER, grid()[2]!]);
    await app.db.update(shipments).set({ state: "waiting", holdReason: null, nextTryAt: new Date(Date.now() + 60_000), updatedAt: new Date(Date.now() + 3000) }).where(eq(shipments.id, second!.id));
    await syncSheets({ db: app.db, sheets });
    expect(grid().map((g) => g[8])).toEqual(["State", "Signed for", "Waiting for a retry"]);
  });

  it("keeps the lead's text as text (written RAW, never a formula)", () => {
    expect(grid()[1]!.join(" ")).not.toContain("HYPERLINK");
    const s = { waybillYear: 26, waybillSeq: 7, createdAt: new Date(0), updatedAt: new Date(0), contact: { firstName: "=1+1", email: "a@b.co" }, source: "form", state: "signed" } as unknown as typeof shipments.$inferSelect;
    expect(rowOf(s, "Trial", null)[2]).toBe("=1+1");
  });

  it("stops at a sheet that was unshared, tries again later, and says why", async () => {
    books.get(ID)!.shared = false;
    await send("third");
    expect(await syncSheets({ db: app.db, sheets })).toMatchObject({ retry: 1, written: 0 });
    const v = await sheetView(app.db, acc, key.client_email);
    expect(v.link).toMatchObject({ title: "Northpine leads", lastError: "Fernway can no longer open the sheet (unshared or deleted)" });
    expect(v.rows.waiting).toBe(1);
    books.get(ID)!.shared = true;
    await app.db.update(sheetRows).set({ nextAt: new Date(0) });
    expect(await syncSheets({ db: app.db, sheets })).toMatchObject({ written: 1 });
    expect((await sheetView(app.db, acc, key.client_email)).link?.lastError).toBeNull();
  });

  it("unlinks: the rows stay in the sheet, Fernway writes no more, audited", async () => {
    expect(await unlinkSheet(app.db, owner())).toBe(true);
    expect(await app.db.select().from(sheetLinks)).toHaveLength(0);
    const before = grid().length;
    await send("after-unlink");
    await syncSheets({ db: app.db, sheets });
    expect(grid()).toHaveLength(before);
    expect(await app.db.select().from(auditLog).where(eq(auditLog.action, "sheet.unlinked"))).toHaveLength(1);
  });
});
