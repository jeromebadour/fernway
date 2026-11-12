// Google Sheets (plan step 8): an account links one Google Sheet, and every lead becomes a row on its own tab,
// "Fernway leads", kept up to date as the lead moves (signed for, held, resent, scored). Fernway signs in to Google as
// its own service account (GOOGLE_SHEETS_KEY, a JSON key): the owner shares the sheet with that address, so Fernway
// reaches only the sheets shared with it. Values are written RAW, so a lead's text is never read as a formula.
import { createSign } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { formatWaybill } from "@fernway/core";
import type { Db } from "./db.js";
import { audit, type Actor } from "./console.js";
import type { Role } from "./schema.js";
import { leadScores, routes, sheetLinks, sheetRows, shipments } from "./schema.js";

export const SHEETS_API = "https://sheets.googleapis.com";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const SHEET_TAB = "Fernway leads";
export const SHEET_HEADER = ["Waybill", "Picked up (UTC)", "Name", "Email", "Phone", "Company", "Route", "From", "State", "Score", "Claude's read", "Updated (UTC)"];
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
  /** Makes the "Fernway leads" tab with its header row, unless it is there. */
  prepare(id: string): Promise<SheetAnswer>;
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
    async prepare(id) {
      const got = await call("GET", `/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties.title`);
      if (!got.ok) return got;
      const tabs = ((got.json as { sheets?: { properties?: { title?: string } }[] }).sheets ?? []).map((s) => s.properties?.title);
      if (!tabs.includes(SHEET_TAB)) {
        const made = await call("POST", `/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, {
          requests: [{ addSheet: { properties: { title: SHEET_TAB, gridProperties: { frozenRowCount: 1 } } } }],
        });
        if (!made.ok) return made;
      }
      return call("PUT", `/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${q(SHEET_TAB)}!A1:${LAST_COL}1`)}?valueInputOption=RAW`, { values: [SHEET_HEADER] });
    },
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
const sourceWords: Record<string, string> = { form: "Website form", embed: "Embed form", wordpress: "WordPress", laravel: "Laravel", api: "API", import: "Import", demo: "Demo", stripe: "Stripe payment", workflow: "GHL workflow" };

export type LinkResult = { ok: true; title: string } | { ok: false; problems: string[] };

/** Links the sheet the owner pasted: Fernway must reach it (shared with its address) and makes its tab and header.
 *  Leads picked up from now on are written; replacing a link starts the new sheet from now. */
export async function linkSheet(db: Db, sheets: Sheets, m: Actor & { role: Role }, input: string): Promise<LinkResult> {
  if (m.role !== "owner" && m.role !== "admin") return { ok: false, problems: ["only the owner or an admin may link a sheet"] };
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
  const links = await c.db.select().from(sheetLinks);
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
  return {
    serviceEmail,
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
