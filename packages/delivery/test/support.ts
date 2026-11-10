// Test support: a fresh database per test file (the real migrations, applied in order) and a fake GHL that answers
// like the real one and fails on demand.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { Client } from "pg";
import { createDb, type Db } from "../src/db.js";
import type { Deps } from "../src/engine.js";
import { createGhlClient, type GhlConnection } from "../src/ghl.js";
import { accounts, routes } from "../src/schema.js";

const ADMIN = process.env.TEST_PG_ADMIN ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const MIGRATIONS = join(import.meta.dirname, "../../../db/migrations");

export async function freshDatabase(label: string) {
  const name = `fernway_test_${label}_${process.pid}`;
  const admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = ADMIN.replace(/\/[^/]*$/, `/${name}`);
  const owner = new Client({ connectionString: url });
  await owner.connect();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await owner.query(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await owner.query(`alter role fernway_app password 'test-app-password'`);
  await owner.end();
  const appUrl = url.replace(/\/\/[^@]*@/, "//fernway_app:test-app-password@");
  return {
    url,
    appUrl,
    async drop() {
      const a = new Client({ connectionString: ADMIN });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** The fake GHL. Each path answers from its own script, then 200 forever; it remembers every request. */
export const GHL_BASE = "http://ghl.fake";
type Scripted = { status: number; body?: unknown; delayMs?: number };
type Path = "contact" | "note" | "appointment" | "opportunity";

export function fakeGhl() {
  const script: Record<string, Scripted[]> = { contact: [], note: [], appointment: [], opportunity: [] };
  const appointments: Record<string, unknown>[] = [];
  const requests: { path: Path; body: Record<string, unknown>; auth: string | null }[] = [];
  const notes: { contactId: string; body: string; id: string }[] = [];
  const freeSlotAsks: Record<string, string>[] = [];
  let freeSlotDays: Record<string, { slots: string[] }> = {};
  const deleted: string[] = [];
  const deleteAnswers: number[] = [];
  // Contacts are matched like GHL's upsert with duplicates off: by email, else by phone.
  const contacts = new Map<string, string>();
  const opportunities = new Map<string, string>();

  const answer = async (path: Path, request: Request, contactId?: string) => {
    const body = (await request.json()) as Record<string, unknown>;
    requests.push({ path, body, auth: request.headers.get("authorization") });
    const next = script[path]!.shift();
    if (next?.delayMs) await delay(next.delayMs);
    if (next && next.status !== 200) return HttpResponse.json(next.body ?? { message: "scripted failure" }, { status: next.status });
    if (path === "appointment") {
      const id = `a_${appointments.length + 1}`;
      appointments.push({ ...body, id });
      return HttpResponse.json({ id, ...body });
    }
    if (path === "note") {
      const id = `n_${notes.length + 1}`;
      notes.push({ contactId: contactId!, body: String(body.body), id });
      return HttpResponse.json({ note: { id, body: body.body } }, { status: 201 });
    }
    if (path === "contact") {
      const key = String(body.email ?? body.phone);
      const isNew = !contacts.has(key);
      if (isNew) contacts.set(key, `c_${contacts.size + 1}`);
      return HttpResponse.json({ new: isNew, contact: { id: contacts.get(key) } });
    }
    const key = `${body.contactId}:${body.pipelineId}`;
    const isNew = !opportunities.has(key);
    if (isNew) opportunities.set(key, `o_${opportunities.size + 1}`);
    return HttpResponse.json({ new: isNew, opportunity: { id: opportunities.get(key) } });
  };

  const server = setupServer(
    http.post(`${GHL_BASE}/contacts/upsert`, ({ request }) => answer("contact", request)),
    http.post(`${GHL_BASE}/opportunities/upsert`, ({ request }) => answer("opportunity", request)),
    http.post(`${GHL_BASE}/contacts/:id/notes`, ({ request, params }) => answer("note", request, String(params.id))),
    http.post(`${GHL_BASE}/calendars/events/appointments`, ({ request }) => answer("appointment", request)),
    http.get(`${GHL_BASE}/calendars/:id/free-slots`, ({ request }) => {
      const u = new URL(request.url);
      freeSlotAsks.push(Object.fromEntries(u.searchParams));
      return HttpResponse.json({ ...freeSlotDays, traceId: "t_1" });
    }),
    http.delete(`${GHL_BASE}/calendars/events/:id`, ({ params }) => {
      const status = deleteAnswers.shift() ?? 200;
      if (status === 200) deleted.push(`calendars/events/${params.id}`);
      return HttpResponse.json({ succeeded: status === 200 }, { status });
    }),
    http.delete(`${GHL_BASE}/contacts/:id/notes/:note`, ({ params }) => {
      const status = deleteAnswers.shift() ?? 200;
      if (status === 200) deleted.push(`contacts/${params.id}/notes/${params.note}`);
      return HttpResponse.json({ succeded: status === 200 }, { status });
    }),
    http.delete(`${GHL_BASE}/:what/:id`, ({ params }) => {
      const status = deleteAnswers.shift() ?? 200;
      if (status === 200) deleted.push(`${params.what}/${params.id}`);
      return HttpResponse.json({ succeded: status === 200 }, { status });
    }),
  );

  return {
    server,
    requests,
    notes,
    appointments,
    freeSlotAsks,
    setFreeSlots(days: Record<string, { slots: string[] }>) {
      freeSlotDays = days;
    },
    deleted,
    deleteAnswers,
    contacts,
    opportunities,
    fail(path: Path, ...answers: Scripted[]) {
      script[path]!.push(...answers);
    },
    reset() {
      script.contact = [];
      script.note = [];
      script.appointment = [];
      appointments.length = 0;
      freeSlotAsks.length = 0;
      freeSlotDays = {};
      script.opportunity = [];
      notes.length = 0;
      requests.length = 0;
      deleted.length = 0;
      deleteAnswers.length = 0;
      contacts.clear();
      opportunities.clear();
    },
  };
}

export function fakeConnection(): GhlConnection & { refreshes: number } {
  const c = {
    locationId: "loc_fake",
    refreshes: 0,
    async accessToken() {
      return `token-${c.refreshes}`;
    },
    async refresh() {
      c.refreshes += 1;
    },
  };
  return c;
}

export type Scheduled = { shipmentId: number; tryNumber: number; delayMs: number };

/** Engine deps with the fake GHL and a schedule that only records, so each test steps through tries itself. */
export function testDeps(db: Db, conn: GhlConnection | null, timeScale = 1) {
  const scheduled: Scheduled[] = [];
  const deps: Deps = {
    db,
    ghl: createGhlClient({ baseUrl: GHL_BASE, timeoutMs: 200 }),
    connectionFor: async () => conn,
    schedule: async (shipmentId, tryNumber, delayMs) => {
      scheduled.push({ shipmentId, tryNumber, delayMs });
    },
    timeScale,
  };
  return { deps, scheduled };
}

/** An account with two routes: "trial" sets a pipeline stage, "contact-only" doesn't. */
export async function seedAccount(db: Db) {
  const [account] = await db.insert(accounts).values({ name: "Northpine Dental" }).returning();
  await db.insert(routes).values([
    { accountId: account!.id, key: "trial", label: "Trial", pipelineId: "pipe_sales", stageId: "stage_trial", tags: ["trial"] },
    { accountId: account!.id, key: "contact-only", label: "Newsletter", tags: ["newsletter"] },
    { accountId: account!.id, key: "demo", label: "Demo", pipelineId: "pipe_sales", stageId: "stage_booked", calendarId: "cal_demo", tags: ["demo"] },
  ]);
  return account!.id;
}

export { createDb };
