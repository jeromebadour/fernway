// The Drizzle schema (src/schema.ts) must match the tables the migrations build, column by column.
import { getTableConfig } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "../src/schema.js";
import { freshDatabase } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
beforeAll(async () => {
  database = await freshDatabase("schema");
});
afterAll(async () => database.drop());

it("matches the real tables", async () => {
  const c = new Client({ connectionString: database.url });
  await c.connect();
  for (const table of [schema.accounts, schema.routes, schema.shipments, schema.scans, schema.ghlConnections, schema.stripeEvents, schema.stripeInvoices, schema.users, schema.sessions, schema.apiKeys, schema.recoveryCodes, schema.alerts, schema.auditLog, schema.invites, schema.staff, schema.operatorAudit, schema.incidents, schema.ghlEvents, schema.workflowTriggers, schema.triggerSends, schema.embedForms]) {
    const cfg = getTableConfig(table);
    const { rows } = await c.query(
      "select column_name, is_nullable from information_schema.columns where table_name = $1 order by column_name",
      [cfg.name],
    );
    const real = rows.map((r) => `${r.column_name}${r.is_nullable === "NO" ? "!" : ""}`);
    const mine = cfg.columns.map((col) => `${col.name}${col.notNull ? "!" : ""}`).sort();
    expect(mine, cfg.name).toEqual(real);
  }
  await c.end();
});
