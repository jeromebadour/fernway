// Claude score against a real database, a fake Claude and the fake GHL: only leads of accounts that turned it on, after
// they did; Claude is sent no name, email or phone; every call priced and counted against the month's cap; busy is
// tried again, a refused key is not; the score reaches the GHL contact as one note and one score tag, once signed for.
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverTry, ingestLead } from "../src/engine.js";
import { purgeExpired } from "../src/retention.js";
import { accounts, auditLog, claudeSpend, leadScores, shipments } from "../src/schema.js";
import {
  costOf, createClaude, noteScores, scoreDue, scoreInput, scoreOf, scoreView, setScoring, spendThisMonth, writeScoresToGhl, SCHEMA,
} from "../src/score.js";
import { createDb, fakeConnection, fakeGhl, freshDatabase, seedAccount, testDeps } from "./support.js";

const CLAUDE = "http://claude.fake";
type Answer = { status: number; body?: unknown };
const claudeScript: Answer[] = [];
const claudeAsks: { body: Record<string, unknown>; key: string | null }[] = [];
const said = (score: number, summary = "A dental clinic owner asking to start a trial this week.", signals = ["Asks to start now", "Work email domain"]) => ({
  status: 200,
  body: {
    id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ score, summary, signals }) }],
    usage: { input_tokens: 812, output_tokens: 64 },
  },
});
const claudeHandler = (
  http.post(`${CLAUDE}/v1/messages`, async ({ request }) => {
    claudeAsks.push({ body: (await request.json()) as Record<string, unknown>, key: request.headers.get("x-api-key") });
    const next = claudeScript.shift() ?? said(4);
    return HttpResponse.json(next.body ?? { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, { status: next.status });
  })
);
// One interceptor per process: Claude's address is added to the fake GHL's server.
const ghl = fakeGhl();

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;
let other: number;
let claude: ReturnType<typeof createClaude>;
const conn = fakeConnection();
const lead = (key: string, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: `score-${key}-0001`, source: "form", route: "trial",
  contact: { firstName: "Lena", lastName: "Hartmann", email: "lena@northpine-dental.com", phone: "+15035550142", companyName: "Northpine Dental", website: "northpine-dental.com", message: "We want to start this week.", ...extra },
});
const owner = () => ({ accountId: acc, userId: null, name: "Lena Hartmann", role: "owner" as const });

beforeAll(async () => {
  ghl.server.listen({ onUnhandledRequest: "error" });
  ghl.server.use(claudeHandler);
  // Made after the fake servers listen: the client keeps the fetch it was given.
  claude = createClaude({ apiKey: "sk-ant-test", baseUrl: CLAUDE, timeoutMs: 500 });
  database = await freshDatabase("score");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
  other = await seedAccount(app.db);
});
afterAll(async () => { ghl.server.close(); await app.pool.end(); await database.drop(); });
beforeEach(() => { claudeScript.length = 0; claudeAsks.length = 0; ghl.reset(); });
afterEach(async () => { await app.db.delete(leadScores); await app.db.delete(claudeSpend); await app.db.delete(shipments); });

async function send(key: string, account = acc, extra: Record<string, unknown> = {}) {
  const { deps } = testDeps(app.db, conn);
  const r = await ingestLead(deps, account, lead(key, extra));
  if (!r.ok) throw new Error(r.problems.join(", "));
  return { id: r.waybill.id, deps };
}

describe("what Claude is sent", () => {
  it("never the person's name, email or phone", () => {
    const x = scoreInput({ firstName: "Lena", lastName: "Hartmann", email: "lena@gmail.com", phone: "+15035550142", companyName: "Northpine", message: "hi" },
      { business: "Fernway sandbox", route: "Trial", source: "form", meetingBooked: false });
    expect(x).toEqual({ business: "Fernway sandbox", route: "Trial", source: "form", company: "Northpine", website: null, emailDomain: "gmail.com", freeMailbox: true, phoneGiven: true, meetingBooked: false, message: "hi" });
    expect(JSON.stringify(x)).not.toMatch(/Lena|Hartmann|5550142|lena@/);
  });
});

describe("scoring", () => {
  it("scores only leads of an account that turned it on, picked up after it did, once each", async () => {
    await app.db.update(accounts).set({ scoreSince: null }).where(eq(accounts.id, acc));
    await send("before");
    expect(await setScoring(app.db, { ...owner(), role: "member" }, true)).toBe(false);
    expect(await setScoring(app.db, owner(), true)).toBe(true);
    const after = await send("after");
    await send("elsewhere", other);
    expect(await noteScores(app.db, [])).toBe(1);
    expect(await noteScores(app.db, [])).toBe(0);
    const rows = await app.db.select().from(leadScores);
    expect(rows.map((r) => r.shipmentId)).toEqual([after.id]);
    expect(await noteScores(app.db, [acc])).toBe(0);
    const audited = await app.db.select().from(auditLog).where(eq(auditLog.action, "score.on"));
    expect(audited).toHaveLength(1);
  });

  it("asks Claude with the schema and the lead as data, keeps the score and prices the call", async () => {
    const { id } = await send("asks");
    await noteScores(app.db, []);
    const r = await scoreDue({ db: app.db, claude });
    expect(r).toEqual({ scored: 1, retry: 0, failed: 0, skipped: 0 });
    const ask = claudeAsks[0]!;
    expect(ask.key).toBe("sk-ant-test");
    expect(ask.body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 400, thinking: { type: "disabled" }, output_config: { format: { type: "json_schema", schema: SCHEMA } } });
    const text = JSON.stringify(ask.body.messages);
    expect(text).toContain("<lead>");
    expect(text).toContain("northpine-dental.com");
    expect(text).not.toMatch(/Lena|Hartmann|5550142/);
    const s = await scoreOf(app.db, acc, id);
    expect(s).toMatchObject({ state: "scored", score: 4, word: "Strong", signals: ["Asks to start now", "Work email domain"], model: "claude-haiku-5-5", tag: "fernway-score-4" });
    expect(s!.costUsd).toBe(costOf("claude-haiku-5-5", 812, 64));
    expect(costOf("claude-haiku-5-5", 812, 64)).toBe(0.000113);
    expect(await spendThisMonth(app.db)).toMatchObject({ calls: 1, spentUsd: 0.000113 });
    expect(await scoreOf(app.db, other, id)).toBeNull();
  });

  it("tries again when Claude is busy, gives up after four waits, and never retries a refused key or a refusal", async () => {
    const busy = await send("busy");
    await noteScores(app.db, []);
    claudeScript.push({ status: 529 });
    expect(await scoreDue({ db: app.db, claude })).toMatchObject({ retry: 1 });
    let [row] = await app.db.select().from(leadScores).where(eq(leadScores.shipmentId, busy.id));
    expect(row).toMatchObject({ state: "waiting", tries: 1 });
    expect(row!.nextAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    for (let i = 0; i < 4; i++) {
      claudeScript.push({ status: 529 });
      await app.db.update(leadScores).set({ nextAt: new Date(0) }).where(eq(leadScores.shipmentId, busy.id));
      await scoreDue({ db: app.db, claude });
    }
    [row] = await app.db.select().from(leadScores).where(eq(leadScores.shipmentId, busy.id));
    expect(row).toMatchObject({ state: "failed", tries: 5, ghlState: "skipped" });

    const key = await send("key");
    await noteScores(app.db, []);
    claudeScript.push({ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
    expect(await scoreDue({ db: app.db, claude })).toMatchObject({ failed: 1 });
    expect((await scoreOf(app.db, acc, key.id))!.why).toMatch(/^Claude answered 401/);

    const no = await send("refusal");
    await noteScores(app.db, []);
    claudeScript.push({ status: 200, body: { model: "claude-haiku-5-5", stop_reason: "refusal", content: [], usage: { input_tokens: 700, output_tokens: 3 } } });
    expect(await scoreDue({ db: app.db, claude })).toMatchObject({ skipped: 1 });
    expect(await scoreOf(app.db, acc, no.id)).toMatchObject({ state: "skipped", why: "Claude declined to score this lead" });
    expect((await spendThisMonth(app.db)).calls).toBe(1);
  });

  it("makes no call once the month's cap or the account's day is used up", async () => {
    await app.db.insert(claudeSpend).values({ month: `${new Date().toISOString().slice(0, 7)}-01`, calls: 9, spentUsd: "8.000000" });
    const capped = await send("cap");
    await noteScores(app.db, []);
    expect(await scoreDue({ db: app.db, claude })).toMatchObject({ skipped: 1 });
    expect(claudeAsks).toHaveLength(0);
    expect(await scoreOf(app.db, acc, capped.id)).toMatchObject({ state: "skipped", why: "this month's Claude budget is used up" });
    await app.db.delete(claudeSpend);

    const a = await send("day-1");
    const b = await send("day-2");
    await noteScores(app.db, []);
    expect(await scoreDue({ db: app.db, claude, perDay: 1 })).toMatchObject({ scored: 1, skipped: 1 });
    const states = [(await scoreOf(app.db, acc, a.id))!.state, (await scoreOf(app.db, acc, b.id))!.state].sort();
    expect(states).toEqual(["scored", "skipped"]);
  });

  it("keeps a bad answer out: a wrong shape is tried again, signals cut to three", async () => {
    const odd = await send("odd");
    await noteScores(app.db, []);
    claudeScript.push({ status: 200, body: { model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: '{"score":9,"summary":"x","signals":["a"]}' }], usage: { input_tokens: 700, output_tokens: 20 } } });
    expect(await scoreDue({ db: app.db, claude })).toMatchObject({ retry: 1 });
    claudeScript.push(said(2, "Vague ask.", ["a", "b", "c", "d"]));
    await app.db.update(leadScores).set({ nextAt: new Date(0) }).where(eq(leadScores.shipmentId, odd.id));
    await scoreDue({ db: app.db, claude });
    expect(await scoreOf(app.db, acc, odd.id)).toMatchObject({ score: 2, signals: ["a", "b", "c"] });
  });
});

describe("back to GHL", () => {
  it("waits for the lead to be signed for, then adds one note and the score tag, the other score tags taken off", async () => {
    const { id, deps } = await send("ghl");
    await noteScores(app.db, []);
    claudeScript.push(said(5));
    await scoreDue({ db: app.db, claude });
    const g = { db: app.db, ghl: deps.ghl, connectionFor: deps.connectionFor };
    expect(await writeScoresToGhl(g)).toEqual({ written: 0, retry: 0, failed: 0, skipped: 0 });
    await deliverTry(deps, id, 1);
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, id));
    expect(s!.state).toBe("signed");
    ghl.tags.set(s!.ghlContactId!, new Set(["trial", "fernway-score-2"]));
    await app.db.update(leadScores).set({ ghlNextAt: new Date(0) }).where(eq(leadScores.shipmentId, id));
    expect(await writeScoresToGhl(g)).toMatchObject({ written: 1 });
    const note = ghl.notes.find((n) => n.body.startsWith("Fernway lead score"));
    expect(note!.body).toBe("Fernway lead score: 5 of 5 (Ready to buy)\nA dental clinic owner asking to start a trial this week.\n· Asks to start now\n· Work email domain\nRead by Claude for waybill " + (await scoreView(app.db, acc)).latest[0]!.waybill + ".");
    expect([...ghl.tags.get(s!.ghlContactId!)!].sort()).toEqual(["fernway-score-5", "trial"]);
    expect(await scoreOf(app.db, acc, id)).toMatchObject({ ghl: "written" });
  });

  it("tries a failed tag again without a second note", async () => {
    const { id, deps } = await send("ghl-retry");
    await noteScores(app.db, []);
    await scoreDue({ db: app.db, claude });
    await deliverTry(deps, id, 1);
    const g = { db: app.db, ghl: deps.ghl, connectionFor: deps.connectionFor };
    ghl.fail("tags", { status: 503 });
    expect(await writeScoresToGhl(g)).toMatchObject({ retry: 1 });
    await app.db.update(leadScores).set({ ghlNextAt: new Date(0) }).where(eq(leadScores.shipmentId, id));
    expect(await writeScoresToGhl(g)).toMatchObject({ written: 1 });
    expect(ghl.notes.filter((n) => n.body.startsWith("Fernway lead score"))).toHaveLength(1);
  });

  it("removes the score note from a contact another lead keeps, when the old lead goes", async () => {
    await app.db.update(accounts).set({ scoreSince: new Date(Date.now() - 40 * 86_400_000) }).where(eq(accounts.id, acc));
    const old = await send("old", acc, { message: undefined });
    await deliverTry(old.deps, old.id, 1);
    await app.db.update(shipments).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(shipments.id, old.id));
    await app.db.insert(leadScores).values({ shipmentId: old.id, accountId: acc, state: "scored", score: 3, ghlState: "written", ghlNoteId: "n_score" });
    const newer = await send("newer");
    await deliverTry(newer.deps, newer.id, 1);
    const r = await purgeExpired(old.deps, acc);
    expect(r.removed).toBeGreaterThanOrEqual(1);
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, newer.id));
    expect(ghl.deleted).toContain(`contacts/${s!.ghlContactId}/notes/n_score`);
    expect(await app.db.select().from(leadScores).where(eq(leadScores.shipmentId, old.id))).toHaveLength(0);
  });
});

describe("the console", () => {
  it("shows the month: how many, by score, the average, the cost, and the latest", async () => {
    const a = await send("view-a");
    const b = await send("view-b");
    await noteScores(app.db, []);
    claudeScript.push(said(5), said(2, "Asking about a job, not a trial.", ["Not a buyer"]));
    await scoreDue({ db: app.db, claude });
    const v = await scoreView(app.db, acc);
    expect(v.on).toBe(true);
    expect(v.month).toMatchObject({ scored: 2, byScore: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 }, average: 3.5, waiting: 0 });
    expect(v.month.costUsd).toBeCloseTo(2 * 0.000113, 6);
    expect(v.latest.map((x) => x.shipmentId).sort()).toEqual([a.id, b.id].sort());
    expect(await setScoring(app.db, owner(), false)).toBe(true);
    expect((await scoreView(app.db, acc)).on).toBe(false);
    await setScoring(app.db, owner(), true);
  });
});
