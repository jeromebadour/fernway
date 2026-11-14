// Google Sheets (plan step 8): an account links one Google Sheet, and every lead becomes a row on its own tab,
// "Fernway leads", kept up to date as the lead moves (signed for, held, resent, scored). Fernway signs in to Google as
// its own service account (GOOGLE_SHEETS_KEY, a JSON key): the owner shares the sheet with that address, so Fernway
// reaches only the sheets shared with it. Values are written RAW, so a lead's text is never read as a formula.
import { createHash, createSign } from "node:crypto";
import { and, asc, desc, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { formatWaybill, parseWaybill } from "@fernway/core";
import { ingestLead, type Deps } from "./engine.js";
import { readable } from "./track.js";
import type { Db } from "./db.js";
import { audit, type Actor } from "./console.js";
import { entitlementFor, lacking, notOnPlan } from "./plans.js";
import type { Role } from "./schema.js";
import { leadScores, routes, sheetLinks, sheetRows, shipments } from "./schema.js";

export const SHEETS_API = "https://sheets.googleapis.com";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const SHEET_TAB = "Fernway leads";
export const SHEET_HEADER = ["Waybill", "Picked up (UTC)", "Name", "Email", "Phone", "Company", "Route", "From", "State", "Score", "Claude's read", "Updated (UTC)"];
export const IN_TAB = "Leads in";
export const IN_HEADER = ["First name", "Last name", "Email", "Phone", "Company", "Website", "Message", "Waybill (Fernway)", "State (Fernway)", "Note (Fernway)"];
/** At most this many new rows become leads in one read (a pasted list of 1,000 goes through in five minutes). */
export const IN_PER_READ = 200;
export const SHEET_WAITS_MIN = [1, 5, 15, 60, 240];
const LAST_COL = "L";

export type ServiceKey = { client_email: string; private_key: string };

/** The service account's key, from GOOGLE_SHEETS_KEY (the JSON key file, base64). */
export function serviceKeyFrom(b64: string | undefined): ServiceKey | null {
  if (!b64) return null;
  try {
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Partial<ServiceKey> & { type?: string };
    return j.type === "service_account" && j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch { return null; }
}

/** The sheet's id from the link the owner pastes (or the id itself). */
export function sheetIdFrom(input: string): string | null {
  const t = input.trim();
  const m = t.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}

export type SheetAnswer = { ok: true; json: unknown } | { ok: false; status: number | null; why: string };

export type Sheets = {
  email: string;
  /** The sheet's title, or why it can't be reached (not shared, no such sheet). */
  title(id: string): Promise<SheetAnswer>;
  /** Makes a tab with its header row unless it is there ("Fernway leads" by default); the header is rewritten. */
  prepare(id: string, tab?: string, header?: string[]): Promise<SheetAnswer>;
  /** Every row of a tab, from row 1 (Google leaves empty rows at the end out; empty cells at a row's end too). */
  read(id: string, tab: string): Promise<{ ok: true; rows: string[][] } | { ok: false; status: number | null; why: string }>;
  /** Writes several ranges in one call (values:batchUpdate), RAW. */
  write(id: string, data: { range: string; values: string[][] }[]): Promise<SheetAnswer>;
  append(id: string, row: string[]): Promise<SheetAnswer & { row?: number }>;
  update(id: string, rowNumber: number, row: string[]): Promise<SheetAnswer>;
  /** Where a waybill's row is now (people sort, insert and delete rows), from column A; null when it is gone. */
  find(id: string, waybill: string, near?: number): Promise<{ ok: true; row: number | null } | { ok: false; status: number | null; why: string }>;
};

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export function createSheets(opts: { key: ServiceKey; baseUrl?: string; tokenUrl?: string; fetch?: typeof fetch; timeoutMs?: number }): Sheets {
  const base = (opts.baseUrl ?? SHEETS_API).replace(/\/$/, "");
  const tokenUrl = opts.tokenUrl ?? GOOGLE_TOKEN;
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let token: { value: string; until: number } | null = null;

  // A signed JWT swapped for an hour's access token (Google's service account flow), kept until 5 min before it ends.
  async function access(): Promise<string> {
    if (token && token.until > Date.now() + 5 * 60_000) return token.value;
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: opts.key.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: tokenUrl, iat: now, exp: now + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(opts.key.private_key).toString("base64url");
    const res = await doFetch(tokenUrl, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !j.access_token) throw new Error(`Google refused the sign-in (${res.status}${j.error_description ? `: ${j.error_description}` : ""})`);
    token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function call(method: string, path: string, body?: object): Promise<SheetAnswer> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method, headers: { authorization: `Bearer ${await access()}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { ok: false, status: null, why: e instanceof Error && e.name === "TimeoutError" ? `no answer from Google in ${timeoutMs / 1000} s` : (e instanceof Error ? e.message : "could not reach Google") };
    }
    const text = await res.text();
    if (res.ok) { try { return { ok: true, json: JSON.parse(text || "{}") }; } catch { return { ok: true, json: {} }; } }
    let why = text.slice(0, 200);
    try { why = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? why; } catch { /* keep the text */ }
    return { ok: false, status: res.status, why };
  }

  return {
    email: opts.key.client_email,
    title: (id) => call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}?fields=properties.title,sheets.properties.title`),
    async prepare(id, tab = SHEET_TAB, header = SHEET_HEADER) {
      const got = await call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties.title`);
      if (!got.ok) return got;
      const tabs = ((got.json as { sheets?: { properties?: { title?: string } }[] }).sheets ?? []).map((s) => s.properties?.title);
      if (!tabs.includes(tab)) {
        const made = await call("POST", `/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, {
          requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }],
        });
        if (!made.ok) return made;
      }
      const last = String.fromCharCode(64 + header.length);
      return call("PUT", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(tab)}!A1:${last}1`)}?valueInputOption=RAW`, { values: [header] });
    },
    async read(id, tab) {
      const r = await call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(tab)}!A:J`)}`);
      if (!r.ok) return r;
      return { ok: true, rows: ((r.json as { values?: unknown[][] }).values ?? []).map((row) => row.map((c) => String(c ?? ""))) };
    },
    write: (id, data) => call("POST", `/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`, {
      valueInputOption: "RAW", data: data.map((d) => ({ range: d.range, values: d.values })),
    }),
    async append(id, row) {
      const r = await call("POST", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(SHEET_TAB)}!A:${LAST_COL}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: [row] });
      if (!r.ok) return r;
      const range = (r.json as { updates?: { updatedRange?: string } }).updates?.updatedRange ?? "";
      const n = Number(range.match(/!A(\d+):/)?.[1]);
      return Number.isInteger(n) && n > 1 ? { ...r, row: n } : { ok: false, status: 200, why: `Google wrote the row but did not say where (${range || "no range"})` };
    },
    async find(id, waybill, near) {
      if (near) {
        const one = await call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(SHEET_TAB)}!A${near}`)}`);
        if (!one.ok) return one;
        if ((one.json as { values?: string[][] }).values?.[0]?.[0] === waybill) return { ok: true, row: near };
      }
      const col = await call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(SHEET_TAB)}!A:A`)}`);
      if (!col.ok) return col;
      const i = ((col.json as { values?: string[][] }).values ?? []).findIndex((v) => v[0] === waybill);
      return { ok: true, row: i > 0 ? i + 1 : null };
    },
    update: (id, n, row) => call("PUT", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(SHEET_TAB)}!A${n}:${LAST_COL}${n}`)}?valueInputOption=RAW`, { values: [row] }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Linking a sheet (owners and admins).

const stateWords: Record<string, string> = { picked_up: "Picked up", in_transit: "With GHL", waiting: "Waiting for a retry", signed: "Signed for", held: "Held", returned: "Returned" };
const sourceWords: Record<string, string> = { form: "Website form", embed: "Embed form", wordpress: "WordPress", laravel: "Laravel", api: "API", import: "Import", demo: "Demo", stripe: "Stripe payment", workflow: "GHL workflow", sheet: "Google Sheet" };

export type LinkResult = { ok: true; title: string } | { ok: false; problems: string[] };

/** Links the sheet the owner pasted: Fernway must reach it (shared with its address) and makes its tab and header.
 *  Leads picked up from now on are written; replacing a link starts the new sheet from now. */
export async function linkSheet(db: Db, sheets: Sheets, m: Actor & { role: Role }, input: string): Promise<LinkResult> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may link a sheet"] };
  const plan = await entitlementFor(db, m.accountId);
  if (!plan.features.has("sheets")) return { ok: false, problems: [`sheet: ${notOnPlan("sheets", plan)}`] };
  const id = sheetIdFrom(input);
  if (!id) return { ok: false, problems: ["sheet: the link of a Google Sheet, like https://docs.google.com/spreadsheets/d/…"] };
  const t = await sheets.title(id);
  if (!t.ok) {
    return { ok: false, problems: [t.status === 403 || t.status === 404
      ? `sheet: Fernway can't open it. Share it with ${sheets.email} as an Editor, then try again`
      : `sheet: Google said ${t.status ?? "nothing"}: ${t.why}`] };
  }
  const title = String((t.json as { properties?: { title?: string } }).properties?.title ?? "Untitled");
  const p = await sheets.prepare(id);
  if (!p.ok) return { ok: false, problems: [p.status === 403 ? `sheet: Fernway can read it but not write. Share it with ${sheets.email} as an Editor` : `sheet: Google said ${p.status ?? "nothing"}: ${p.why}`] };
  await db.transaction(async (tx) => {
    await tx.delete(sheetRows).where(eq(sheetRows.accountId, m.accountId));
    await tx.insert(sheetLinks).values({ accountId: m.accountId, spreadsheetId: id, title: title.slice(0, 200), madeBy: m.name.slice(0, 80) })
      .onConflictDoUpdate({ target: sheetLinks.accountId, set: { spreadsheetId: id, title: title.slice(0, 200), madeBy: m.name.slice(0, 80), since: sql`now()`, lastOkAt: null, lastError: null } });
  });
  await audit(db, m, "sheet.linked", { kind: "sheet", id: title.slice(0, 80) }, "new leads are written to the tab Fernway leads");
  return { ok: true, title };
}

export async function unlinkSheet(db: Db, m: Actor & { role: Role }): Promise<boolean> {
  if (m.role !== "owner" && m.role !== "admin") return false;
  const [l] = await db.delete(sheetLinks).where(eq(sheetLinks.accountId, m.accountId)).returning({ title: sheetLinks.title });
  if (!l) return true;
  await db.delete(sheetRows).where(eq(sheetRows.accountId, m.accountId));
  await audit(db, m, "sheet.unlinked", { kind: "sheet", id: l.title.slice(0, 80) }, "Fernway no longer writes to it; the rows already there stay");
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The worker's part: each lead's row, written once and then rewritten whenever what it shows changes.

/** One lead as its row reads, and a fingerprint of it (the row is rewritten only when that changes). */
export function rowOf(s: typeof shipments.$inferSelect, route: string, score: { score: number | null; summary: string | null } | null): string[] {
  const c = s.contact;
  return [
    formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), s.createdAt.toISOString().slice(0, 19).replace("T", " "),
    [c.firstName, c.lastName].filter(Boolean).join(" "), c.email ?? "", c.phone ?? "", c.companyName ?? "", route,
    sourceWords[s.source] ?? s.source, stateWords[s.state] ?? s.state, score?.score ? String(score.score) : "", score?.summary ?? "",
    s.updatedAt.toISOString().slice(0, 19).replace("T", " "),
  ];
}
const fingerprint = (row: string[]) => row.filter((_, i) => i !== 11).join("␟");

export type SheetRun = { written: number; updated: number; retry: number; failed: number };

/** Writes what is new or changed, up to 40 rows a run, per linked account. */
export async function syncSheets(c: { db: Db; sheets: Sheets }): Promise<SheetRun> {
  const run: SheetRun = { written: 0, updated: 0, retry: 0, failed: 0 };
  const all = await c.db.select().from(sheetLinks);
  // A sheet whose account's plan no longer has Sheets is paused, not unlinked: it catches up when the plan has them.
  const paused = new Set(await lacking(c.db, all.map((l) => l.accountId), "sheets"));
  const links = all.filter((l) => !paused.has(l.accountId));
  for (const l of links) {
    // New leads since the link get their row; then every row whose lead changed, or that failed and is due again.
    await c.db.execute(sql`
      insert into sheet_rows (shipment_id, account_id)
      select id, account_id from shipments where account_id = ${l.accountId} and created_at >= ${l.since} and source <> 'stripe'
      on conflict do nothing`);
    const due = await c.db.select({ r: sheetRows, s: shipments, route: routes.label, score: leadScores.score, summary: leadScores.summary, scoreState: leadScores.state })
      .from(sheetRows).innerJoin(shipments, eq(shipments.id, sheetRows.shipmentId)).innerJoin(routes, eq(routes.id, shipments.routeId))
      .leftJoin(leadScores, eq(leadScores.shipmentId, shipments.id))
      .where(and(eq(sheetRows.accountId, l.accountId), isNull(sheetRows.givenUpAt), lte(sheetRows.nextAt, sql`now()`),
        or(isNull(sheetRows.rowNumber), gt(shipments.updatedAt, sheetRows.writtenAt), gt(leadScores.scoredAt, sheetRows.writtenAt))))
      .orderBy(asc(shipments.createdAt)).limit(40);
    for (const d of due) {
      const row = rowOf(d.s, d.route, d.scoreState === "scored" ? { score: d.score, summary: d.summary } : null);
      const print = fingerprint(row);
      const set = (v: Partial<typeof sheetRows.$inferInsert>) => c.db.update(sheetRows).set(v).where(eq(sheetRows.shipmentId, d.r.shipmentId));
      if (d.r.rowNumber && d.r.printed === print) { await set({ writtenAt: new Date() }); continue; }
      // A row that was written is found again by its waybill before it is rewritten: someone may have sorted the sheet.
      let at: number | null = null;
      if (d.r.rowNumber) {
        const f = await c.sheets.find(l.spreadsheetId, row[0]!, d.r.rowNumber);
        if (!f.ok) { await fail(c, l.accountId, d.r, f, run); if (f.status === 403 || f.status === 404) break; continue; }
        at = f.row;
      }
      const a = at ? await c.sheets.update(l.spreadsheetId, at, row) : await c.sheets.append(l.spreadsheetId, row);
      if (a.ok) {
        await set({ rowNumber: at ?? (a as { row?: number }).row ?? null, printed: print, writtenAt: new Date(), tries: 0, lastError: null });
        await c.db.update(sheetLinks).set({ lastOkAt: sql`now()`, lastError: null }).where(eq(sheetLinks.accountId, l.accountId));
        if (at) run.updated++; else run.written++;
        continue;
      }
      await fail(c, l.accountId, d.r, a, run);
      // A sheet Fernway can't open fails the same way for every row: the rest wait for the next run.
      if (a.status === 403 || a.status === 404) break;
    }
  }
  return run;
}

async function fail(c: { db: Db }, accountId: number, r: typeof sheetRows.$inferSelect, a: { status: number | null; why: string }, run: SheetRun) {
  const tries = r.tries + 1;
  const wait = SHEET_WAITS_MIN[tries - 1];
  const why = a.status === 403 || a.status === 404 ? "Fernway can no longer open the sheet (unshared or deleted)" : `Google said ${a.status ?? "nothing"}: ${a.why}`;
  await c.db.update(sheetRows).set({ tries, lastError: why.slice(0, 300), ...(wait === undefined ? { givenUpAt: new Date() } : { nextAt: sql`now() + make_interval(mins => ${wait})` }) })
    .where(eq(sheetRows.shipmentId, r.shipmentId));
  await c.db.update(sheetLinks).set({ lastError: why.slice(0, 300) }).where(eq(sheetLinks.accountId, accountId));
  if (wait === undefined) run.failed++; else run.retry++;
}

// ---------------------------------------------------------------------------------------------------------------
// The console's part.

export type SheetView = {
  serviceEmail: string | null;
  link: { spreadsheetId: string; title: string; url: string; madeBy: string; since: string; lastOkAt: string | null; lastError: string | null } | null;
  rows: { written: number; waiting: number; givenUp: number };
  /** Reading "Leads in": its route (null: off), the last read, what went wrong, and the leads it sent in 30 days. */
  in: { route: string | null; routeLabel: string | null; readAt: string | null; error: string | null; leads30: number };
  latest: { shipmentId: number; waybill: string; who: string; row: number; at: string }[];
};

export async function sheetView(db: Db, accountId: number, serviceEmail: string | null): Promise<SheetView> {
  const [l] = await db.select().from(sheetLinks).where(eq(sheetLinks.accountId, accountId));
  const [n] = await db.select({
    written: sql<number>`count(*) filter (where ${sheetRows.rowNumber} is not null)::int`,
    waiting: sql<number>`count(*) filter (where ${sheetRows.rowNumber} is null and ${sheetRows.givenUpAt} is null)::int`,
    givenUp: sql<number>`count(*) filter (where ${sheetRows.givenUpAt} is not null)::int`,
  }).from(sheetRows).where(eq(sheetRows.accountId, accountId));
  const latest = await db.select({ r: sheetRows, s: shipments }).from(sheetRows).innerJoin(shipments, eq(shipments.id, sheetRows.shipmentId))
    .where(and(eq(sheetRows.accountId, accountId), sql`${sheetRows.rowNumber} is not null`)).orderBy(desc(sheetRows.writtenAt)).limit(8);
  const [routeRow] = l?.inRoute ? await db.select({ label: routes.label }).from(routes).where(and(eq(routes.accountId, accountId), eq(routes.key, l.inRoute))) : [];
  const [from] = await db.select({ n: sql<number>`count(*)::int` }).from(shipments)
    .where(and(eq(shipments.accountId, accountId), eq(shipments.source, "sheet"), gt(shipments.createdAt, sql`now() - interval '30 days'`)));
  return {
    serviceEmail,
    in: { route: l?.inRoute ?? null, routeLabel: routeRow?.label ?? null, readAt: l?.inReadAt?.toISOString() ?? null, error: l?.inError ?? null, leads30: from?.n ?? 0 },
    link: l ? {
      spreadsheetId: l.spreadsheetId, title: l.title, url: `https://docs.google.com/spreadsheets/d/${l.spreadsheetId}/edit`, madeBy: l.madeBy,
      since: l.since.toISOString(), lastOkAt: l.lastOkAt?.toISOString() ?? null, lastError: l.lastError,
    } : null,
    rows: { written: n?.written ?? 0, waiting: n?.waiting ?? 0, givenUp: n?.givenUp ?? 0 },
    latest: latest.map(({ r, s }) => ({
      shipmentId: s.id, waybill: formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }),
      who: [s.contact.firstName, s.contact.lastName].filter(Boolean).join(" ") || s.contact.email || "No name", row: r.rowNumber!, at: r.writtenAt!.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Google Sheets in: the tab "Leads in" of the linked sheet, read every minute.

/** Turns reading "Leads in" on (on a route without a meeting time) or off. Owners and admins; audited. */
export async function setSheetIn(db: Db, sheets: Sheets | null, m: Actor & { role: Role }, routeKey: string | null): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may change this"] };
  const [l] = await db.select().from(sheetLinks).where(eq(sheetLinks.accountId, m.accountId));
  if (!l) return { ok: false, problems: ["sheet: link a sheet first"] };
  if (routeKey !== null) {
    const plan = await entitlementFor(db, m.accountId);
    if (!plan.features.has("sheets")) return { ok: false, problems: [`sheet: ${notOnPlan("sheets", plan)}`] };
  }
  if (routeKey === null) {
    if (l.inRoute) {
      await db.update(sheetLinks).set({ inRoute: null, inError: null }).where(eq(sheetLinks.accountId, m.accountId));
      await audit(db, m, "sheet.in.off", { kind: "sheet", id: l.title.slice(0, 80) }, "rows in Leads in are no longer read");
    }
    return { ok: true };
  }
  const [r] = await db.select({ key: routes.key, calendarId: routes.calendarId }).from(routes).where(and(eq(routes.accountId, m.accountId), eq(routes.key, routeKey)));
  if (!r || r.calendarId) return { ok: false, problems: ["route: a route of this account without a meeting time"] };
  if (!sheets) return { ok: false, problems: ["sheet: Google Sheets isn't set up on this server yet"] };
  const p = await sheets.prepare(l.spreadsheetId, IN_TAB, IN_HEADER);
  if (!p.ok) return { ok: false, problems: [p.status === 403 || p.status === 404 ? `sheet: Fernway can no longer open it. Share it with ${sheets.email} as an Editor` : `sheet: Google said ${p.status ?? "nothing"}: ${p.why}`] };
  await db.update(sheetLinks).set({ inRoute: routeKey, inError: null }).where(eq(sheetLinks.accountId, m.accountId));
  await audit(db, m, "sheet.in.on", { kind: "sheet", id: l.title.slice(0, 80) }, `rows in Leads in become leads on ${routeKey}`);
  return { ok: true };
}

const inFields = ["firstName", "lastName", "email", "phone", "companyName", "website", "message"] as const;
const fieldWords: Record<string, string> = { firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", companyName: "Company", website: "Website", message: "Message" };

/** A row's lead: its cells A to G, trimmed, the empty ones left out. */
export function contactOfRow(row: string[]): Record<string, string> {
  const c: Record<string, string> = {};
  inFields.forEach((f, i) => { const v = (row[i] ?? "").trim(); if (v) c[f] = v; });
  return c;
}

/** One row is one lead: the same cells in the same sheet always give the same key (and so the same waybill). */
export function rowKey(spreadsheetId: string, c: Record<string, string>): string {
  const norm = inFields.map((f) => (f === "email" ? (c[f] ?? "").toLowerCase() : c[f] ?? ""));
  return `sheet-${createHash("sha256").update(JSON.stringify([spreadsheetId, ...norm])).digest("hex").slice(0, 40)}`;
}

/** What Fernway writes after a refused row: each problem as the column it is about. */
export const problemNote = (problems: string[]) =>
  problems.map((p) => p.replace(/^contact\.(\w+): /, (_, f: string) => `${fieldWords[f] ?? f}: `).replace(/^contact: /, "")).join("; ").replace(/^./, (x) => x.toUpperCase());

export type InRun = { sent: number; refreshed: number; refused: number };

/** Reads every linked sheet's "Leads in": new rows become leads (at most IN_PER_READ a read), and each row's waybill,
 *  state and note are written back only where they differ from what the row shows. */
export async function readSheetsIn(c: { db: Db; sheets: Sheets; deps: Deps }): Promise<InRun> {
  const run: InRun = { sent: 0, refreshed: 0, refused: 0 };
  const linked = await c.db.select().from(sheetLinks).where(isNotNull(sheetLinks.inRoute));
  const paused = new Set(await lacking(c.db, linked.map((l) => l.accountId), "sheets"));
  const links = linked.filter((l) => !paused.has(l.accountId));
  for (const l of links) {
    const r = await c.sheets.read(l.spreadsheetId, IN_TAB);
    if (!r.ok) {
      const why = r.status === 403 || r.status === 404 ? "Fernway can no longer open the sheet, or its Leads in tab is gone" : `Google said ${r.status ?? "nothing"}: ${r.why}`;
      await c.db.update(sheetLinks).set({ inError: why.slice(0, 300) }).where(eq(sheetLinks.accountId, l.accountId));
      continue;
    }
    // The leads the rows already name, in one read.
    const named = r.rows.slice(1).map((row) => parseWaybill(row[7] ?? "")).filter((w): w is NonNullable<typeof w> => !!w);
    const known = new Map<string, typeof shipments.$inferSelect>();
    if (named.length) {
      const found = await c.db.select().from(shipments).where(and(eq(shipments.accountId, l.accountId), eq(shipments.source, "sheet"),
        sql`(${shipments.waybillYear}, ${shipments.waybillSeq}) in (${sql.join(named.map((w) => sql`(${w.year}, ${w.seq})`), sql`, `)})`));
      for (const s of found) known.set(formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), s);
    }
    const writes: { range: string; values: string[][] }[] = [];
    let budget = IN_PER_READ;
    for (let i = 1; i < r.rows.length; i++) {
      const row = r.rows[i]!;
      const n = i + 1;
      const want = (wb: string, state: string, note: string) => {
        if ((row[7] ?? "") === wb && (row[8] ?? "") === state && (row[9] ?? "") === note) return false;
        writes.push({ range: `${q(IN_TAB)}!H${n}:J${n}`, values: [[wb, state, note]] });
        return true;
      };
      const contact = contactOfRow(row);
      if (Object.keys(contact).length === 0) continue;
      const key = rowKey(l.spreadsheetId, contact);
      const wb = (row[7] ?? "").trim();
      if (wb) {
        const p = parseWaybill(wb);
        const s = p ? known.get(formatWaybill(p)) : undefined;
        if (!s) { want(wb, row[8] ?? "", "Fernway has no lead with this waybill"); continue; }
        const state = stateWords[s.state] ?? s.state;
        const note = s.idempotencyKey !== key ? "Edited after it was sent: nothing new was sent"
          : s.state === "held" ? (readable(s.holdReason) ?? "") : s.state === "returned" ? "GHL never answered; resend it from the console" : "";
        if (want(formatWaybill({ year: s.waybillYear, seq: s.waybillSeq }), state, note)) run.refreshed++;
        continue;
      }
      if (budget <= 0) continue;
      budget--;
      const res = await ingestLead(c.deps, l.accountId, { idempotencyKey: key, source: "sheet", route: l.inRoute!, contact });
      if (!res.ok) { if (want("", "Not sent", problemNote(res.problems))) run.refused++; continue; }
      want(res.waybill.number, stateWords[res.waybill.state] ?? res.waybill.state, res.duplicate ? "Same as an earlier row: one lead" : "");
      if (!res.duplicate) run.sent++;
    }
    const w = writes.length ? await c.sheets.write(l.spreadsheetId, writes) : null;
    await c.db.update(sheetLinks).set({ inReadAt: sql`now()`, inError: w && !w.ok ? `Google said ${w.status ?? "nothing"}: ${w.why}`.slice(0, 300) : null })
      .where(eq(sheetLinks.accountId, l.accountId));
  }
  return run;
}
