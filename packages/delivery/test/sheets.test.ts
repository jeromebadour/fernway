// Google Sheets against a real database and a fake Google (signed sign-in, sheets kept in memory): a sheet links only
// when shared with Fernway, gets its tab and header once; each lead is one row, rewritten when it changes and found
// again by its waybill when someone sorts the sheet; a sheet that is unshared stops the run and is retried.
import { createVerify, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { auditLog, leadScores, sheetLinks, sheetRows, shipments } from "../src/schema.js";
import {
  contactOfRow, createSheets, linkSheet, problemNote, readSheetsIn, rowKey, rowOf, serviceKeyFrom, setSheetIn, sheetIdFrom, sheetView, syncSheets, unlinkSheet,
  IN_HEADER, IN_TAB, SHEET_HEADER, SHEET_TAB,
} from "../src/sheets.js";
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
    if (what === "values:batchUpdate") {
      for (const d of body!.data as { range: string; values: string[][] }[]) {
        const m = d.range.match(/^'(.+)'!([A-Z])(\d+):[A-Z]\d+$/)!;
        const g = book.tabs.get(m[1]!)!;
        const row = (g[Number(m[3]) - 1] ??= []);
        const start = m[2]!.charCodeAt(0) - 65;
        while (row.length < start) row.push("");
        d.values[0]!.forEach((v, i) => { row[start + i] = v; });
      }
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
    if (decodeURIComponent(rng).endsWith("A:A")) return HttpResponse.json({ values: grid.map((g) => [g[0]]) });
    return HttpResponse.json({ values: grid.map((g) => { const r = [...g]; while (r.length && !r[r.length - 1]) r.pop(); return r; }) });
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

describe("Leads in", () => {
  const tab = () => books.get(ID)!.tabs.get(IN_TAB)!;
  const deps = () => testDeps(app.db, conn).deps;
  it("turns on only with a sheet linked and a route without a meeting time, makes the tab, audited", async () => {
    expect(await setSheetIn(app.db, sheets, owner(), "trial")).toEqual({ ok: false, problems: ["sheet: link a sheet first"] });
    books.get(ID)!.shared = true;
    expect(await linkSheet(app.db, sheets, owner(), ID)).toMatchObject({ ok: true });
    expect(await setSheetIn(app.db, sheets, { ...owner(), role: "member" }, "trial")).toMatchObject({ ok: false });
    expect(await setSheetIn(app.db, sheets, owner(), "demo")).toEqual({ ok: false, problems: ["route: a route of this account without a meeting time"] });
    expect(await setSheetIn(app.db, sheets, owner(), "trial")).toEqual({ ok: true });
    expect(tab()).toEqual([IN_HEADER]);
    expect(await app.db.select().from(auditLog).where(eq(auditLog.action, "sheet.in.on"))).toHaveLength(1);
  });

  it("sends each new row once, writes its waybill and state back, and says why a row was refused", async () => {
    tab().push(["Ada", "Moss", "ada@fjordline.com", "", "Fjordline", "", "Twelve rowers want a trial"]);
    tab().push(["Bo", "", "", "", "", "", "no email or phone"]);
    tab().push(["Cy", "", "cy@nowhere", "", "", "", ""]);
    tab().push([]);
    tab().push(["ada", "moss", "ADA@fjordline.com", "", "Fjordline", "", "Twelve rowers want a trial"]);
    const r = await readSheetsIn({ db: app.db, sheets, deps: deps() });
    expect(r).toEqual({ sent: 2, refreshed: 0, refused: 2 });
    const [ada] = await app.db.select().from(shipments).where(eq(shipments.source, "sheet"));
    expect(ada!.contact).toEqual({ firstName: "Ada", lastName: "Moss", email: "ada@fjordline.com", companyName: "Fjordline", message: "Twelve rowers want a trial" });
    const wb = tab()[1]![7]!;
    expect(wb).toMatch(/^FW 26 \d{5}$/);
    expect(tab()[1]!.slice(8, 10)).toEqual(["Picked up", ""]);
    expect(tab()[2]!.slice(7, 10)).toEqual(["", "Not sent", "An email or a phone number, so GHL can match the contact"]);
    expect(tab()[3]![9]).toBe("Email: a real email address");
    // The same person typed again in another case is a different row, so a different lead; the same cells are one.
    expect(tab()[5]![7]).not.toBe(wb);
    // Read again: nothing new is sent, nothing is rewritten.
    expect(await readSheetsIn({ db: app.db, sheets, deps: deps() })).toEqual({ sent: 0, refreshed: 0, refused: 0 });
    expect(await app.db.select().from(shipments).where(eq(shipments.source, "sheet"))).toHaveLength(2);
  });

  it("follows the lead: signed for shows in the row; an edited row sends nothing and says so", async () => {
    const [ada] = await app.db.select().from(shipments).where(eq(shipments.contact, { firstName: "Ada", lastName: "Moss", email: "ada@fjordline.com", companyName: "Fjordline", message: "Twelve rowers want a trial" }));
    await deliverTry(deps(), ada!.id, 1);
    expect(await readSheetsIn({ db: app.db, sheets, deps: deps() })).toMatchObject({ refreshed: 1 });
    expect(tab()[1]![8]).toBe("Signed for");
    tab()[1]![6] = "Actually twenty rowers";
    expect(await readSheetsIn({ db: app.db, sheets, deps: deps() })).toMatchObject({ sent: 0 });
    expect(tab()[1]![9]).toBe("Edited after it was sent: nothing new was sent");
    expect(await app.db.select().from(shipments).where(eq(shipments.source, "sheet"))).toHaveLength(2);
    // A fixed refused row goes through on the next read.
    tab()[3]![2] = "cy@nowhere.io";
    expect(await readSheetsIn({ db: app.db, sheets, deps: deps() })).toMatchObject({ sent: 1 });
    expect(tab()[3]![7]).toMatch(/^FW 26/);
  });

  it("keeps the row's key to its cells and sheet, and turns off", async () => {
    const c = contactOfRow([" Ada ", "", "A@B.co", "", "", "", ""]);
    expect(c).toEqual({ firstName: "Ada", email: "A@B.co" });
    expect(rowKey(ID, c)).toBe(rowKey(ID, { firstName: "Ada", email: "a@b.co" }));
    expect(rowKey(ID, c)).not.toBe(rowKey("1OtherSheetAbcdefghijklmn", c));
    expect(problemNote(["contact.phone: a phone number with country code, like +1 503 555 0142"])).toBe("Phone: a phone number with country code, like +1 503 555 0142");
    expect(await setSheetIn(app.db, sheets, owner(), null)).toEqual({ ok: true });
    tab().push(["Dee", "", "dee@example.org"]);
    expect(await readSheetsIn({ db: app.db, sheets, deps: deps() })).toEqual({ sent: 0, refreshed: 0, refused: 0 });
  });
});
