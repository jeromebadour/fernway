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

export function fakeGhl() {
  const script: Record<string, Scripted[]> = { contact: [], opportunity: [] };
  const requests: { path: "contact" | "opportunity"; body: Record<string, unknown>; auth: string | null }[] = [];
  const deleted: string[] = [];
  const deleteAnswers: number[] = [];
  // Contacts are matched like GHL's upsert with duplicates off: by email, else by phone.
  const contacts = new Map<string, string>();
  const opportunities = new Map<string, string>();

  const answer = async (path: "contact" | "opportunity", request: Request) => {
    const body = (await request.json()) as Record<string, unknown>;
    requests.push({ path, body, auth: request.headers.get("authorization") });
    const next = script[path]!.shift();
    if (next?.delayMs) await delay(next.delayMs);
    if (next && next.status !== 200) return HttpResponse.json(next.body ?? { message: "scripted failure" }, { status: next.status });
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
    http.delete(`${GHL_BASE}/:what/:id`, ({ params }) => {
      const status = deleteAnswers.shift() ?? 200;
      if (status === 200) deleted.push(`${params.what}/${params.id}`);
      return HttpResponse.json({ succeded: status === 200 }, { status });
    }),
  );

  return {
    server,
    requests,
    deleted,
    deleteAnswers,
    contacts,
    opportunities,
    fail(path: "contact" | "opportunity", ...answers: Scripted[]) {
      script[path]!.push(...answers);
    },
    reset() {
      script.contact = [];
      script.opportunity = [];
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
  ]);
  return account!.id;
}

export { createDb };
