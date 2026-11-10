// Typed view of db/migrations (Drizzle). The SQL migrations are the source of truth; test/schema.test.ts proves this
// file still matches the real tables, column by column.
import { bigint, boolean, integer, jsonb, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The box's own runs (each deploy, the nightly backup, its off-box copy, the weekly restore test), written as the owner. */
export const opsRuns = pgTable("ops_runs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  kind: text("kind").$type<"deploy" | "backup" | "offsite" | "restore_test">().notNull(),
  ok: boolean("ok").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  detail: text("detail").notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  prefix: text("prefix").notNull().unique(),
  secretHash: text("secret_hash").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const routes = pgTable("routes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  pipelineId: text("pipeline_id"),
  stageId: text("stage_id"),
  calendarId: text("calendar_id"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipmentStates = ["picked_up", "in_transit", "waiting", "signed", "held", "returned"] as const;
export type ShipmentState = (typeof shipmentStates)[number];

export const sources = ["form", "embed", "wordpress", "laravel", "api", "import", "demo"] as const;
export type Source = (typeof sources)[number];

export const shipments = pgTable("shipments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  routeId: bigint("route_id", { mode: "number" }).notNull(),
  waybillYear: smallint("waybill_year").notNull(),
  waybillSeq: integer("waybill_seq").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  source: text("source").$type<Source>().notNull(),
  contact: jsonb("contact").$type<LeadContact>().notNull(),
  state: text("state").$type<ShipmentState>().notNull(),
  tries: smallint("tries").notNull().default(0),
  nextTryAt: timestamp("next_try_at", { withTimezone: true }),
  ghlContactId: text("ghl_contact_id"),
  ghlOpportunityId: text("ghl_opportunity_id"),
  ghlNoteId: text("ghl_note_id"),
  bookingStart: timestamp("booking_start", { withTimezone: true }),
  ghlAppointmentId: text("ghl_appointment_id"),
  holdReason: text("hold_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Step = "contact" | "note" | "appointment" | "opportunity";
export const scanKinds = ["picked_up", "checked", "handed", "signed", "retry_scheduled", "held", "returned", "resent"] as const;
export type ScanKind = (typeof scanKinds)[number];

export const scans = pgTable("scans", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  shipmentId: bigint("shipment_id", { mode: "number" }).notNull(),
  kind: text("kind").$type<ScanKind>().notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  try: smallint("try"),
  step: text("step").$type<Step>(),
  sent: jsonb("sent"),
  answerStatus: smallint("answer_status"),
  answerExcerpt: text("answer_excerpt"),
  /** How long GHL took to answer this call, when there was a call. */
  answerMs: integer("answer_ms"),
  note: text("note"),
});

/** The lead as Fernway received it, after checking. */
export type LeadContact = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  website?: string;
  message?: string;
};

export const ghlConnections = pgTable("ghl_connections", {
  accountId: bigint("account_id", { mode: "number" }).primaryKey(),
  locationId: text("location_id").notNull(),
  companyId: text("company_id"),
  userId: text("user_id"),
  scopes: text("scopes").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"connected" | "needs_reconnect">().notNull().default("connected"),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
