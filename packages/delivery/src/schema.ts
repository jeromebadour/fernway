// Typed view of db/migrations (Drizzle). The SQL migrations are the source of truth; test/schema.test.ts proves this
// file still matches the real tables, column by column.
import { bigint, boolean, date, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  plan: text("plan").$type<PlanKey>(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: text("billing_status").$type<BillingStatus>(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  customerShipmentId: bigint("customer_shipment_id", { mode: "number" }),
  /** Claude score on since then (leads picked up after it are scored); null when off. */
  scoreSince: timestamp("score_since", { withTimezone: true }),
});

export const planKeys = ["starter", "growth", "scale"] as const;
export type PlanKey = (typeof planKeys)[number];
export const billingStatuses = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"] as const;
export type BillingStatus = (typeof billingStatuses)[number];

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  accountId: bigint("account_id", { mode: "number" }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stripeInvoices = pgTable("stripe_invoices", {
  id: text("id").primaryKey(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  number: text("number"),
  status: text("status").$type<"draft" | "open" | "paid" | "uncollectible" | "void">().notNull(),
  attemptedUnpaid: boolean("attempted_unpaid").notNull().default(false),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  plan: text("plan").$type<PlanKey>(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  hostedUrl: text("hosted_url"),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const roles = ["owner", "admin", "member"] as const;
export type Role = (typeof roles)[number];

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
  timeZone: text("time_zone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  totpSealed: text("totp_sealed"),
  totpPendingSealed: text("totp_pending_sealed"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  totpLastStep: bigint("totp_last_step", { mode: "number" }),
  dateStyle: text("date_style").$type<DateStyle>().notNull().default("day-month"),
  clock: text("clock").$type<Clock>().notNull().default("24h"),
  emailHeld: boolean("email_held").notNull().default(true),
  emailReturned: boolean("email_returned").notNull().default(true),
  emailWeekly: boolean("email_weekly").notNull().default(false),
});

export const dateStyles = ["day-month", "month-day", "iso"] as const;
export type DateStyle = (typeof dateStyles)[number];
export const clocks = ["24h", "12h"] as const;
export type Clock = (typeof clocks)[number];

export const recoveryCodes = pgTable("recovery_codes", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const memberships = pgTable("memberships", {
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  role: text("role").$type<Role>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.accountId] })]);

export const sessionEnds = ["signed_out", "signed_out_elsewhere", "signed_out_from_device", "password_changed", "two_step_changed", "expired", "account_deleted"] as const;
export const sessions = pgTable("sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  device: text("device").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endedWhy: text("ended_why").$type<(typeof sessionEnds)[number]>(),
});

export const emailLinks = pgTable("email_links", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<"confirm" | "reset">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
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
  madeBy: bigint("made_by", { mode: "number" }),
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

export const sources = ["form", "embed", "wordpress", "laravel", "api", "import", "demo", "stripe", "workflow", "sheet"] as const;
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
  /** The GHL workflow that sent this lead ("Track with Fernway"), so its own trigger never fires on it. */
  viaWorkflow: text("via_workflow"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Step = "contact" | "note" | "appointment" | "opportunity";
export const scanKinds = ["picked_up", "checked", "handed", "signed", "retry_scheduled", "held", "returned", "resent", "ghl_moved", "ghl_changed", "ghl_deleted"] as const;
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

export const alertKinds = ["held", "returned", "weekly"] as const;
export type AlertKind = (typeof alertKinds)[number];
export const alerts = pgTable("alerts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  kind: text("kind").$type<AlertKind>().notNull(),
  shipmentId: bigint("shipment_id", { mode: "number" }),
  week: text("week"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  tries: smallint("tries").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  givenUpAt: timestamp("given_up_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const auditActions = ["lead.resent", "leads.resent", "route.made", "route.changed", "ghl.connected", "ghl.disconnected",
  "member.invited", "member.joined", "member.role", "member.removed", "invite.cancelled", "key.made", "key.revoked", "plan.changed",
  "form.made", "form.changed", "form.revoked", "score.on", "score.off", "sheet.linked", "sheet.unlinked", "sheet.in.on", "sheet.in.off", "hook.made", "hook.changed", "hook.removed", "hook.resent"] as const;
export type AuditAction = (typeof auditActions)[number];
export type AuditTarget = "lead" | "route" | "member" | "invite" | "key" | "ghl" | "plan" | "form" | "score" | "sheet" | "hook";
export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }),
  who: text("who").notNull(),
  action: text("action").$type<AuditAction>().notNull(),
  targetKind: text("target_kind").$type<AuditTarget>(),
  targetId: text("target_id"),
  detail: text("detail").notNull().default(""),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  email: text("email").notNull(),
  role: text("role").$type<"admin" | "member">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: bigint("invited_by", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

export const staffRoles = ["owner", "support", "viewer"] as const;
export type StaffRole = (typeof staffRoles)[number];
export const staff = pgTable("staff", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  role: text("role").$type<StaffRole>().notNull(),
  addedBy: bigint("added_by", { mode: "number" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const operatorActions = ["staff.added", "staff.role", "staff.removed", "account.synced", "account.trial_extended",
  "incident.acknowledged", "incident.noted"] as const;
export type OperatorAction = (typeof operatorActions)[number];
export const operatorAudit = pgTable("operator_audit", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: bigint("user_id", { mode: "number" }),
  who: text("who").notNull(),
  action: text("action").$type<OperatorAction>().notNull(),
  accountId: bigint("account_id", { mode: "number" }),
  target: text("target"),
  detail: text("detail").notNull().default(""),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  watcher: text("watcher").notNull(),
  level: text("level").$type<"warn" | "down">().notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  firstReading: text("first_reading").notNull(),
  worstReading: text("worst_reading").notNull(),
  acknowledgedBy: bigint("acknowledged_by", { mode: "number" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  note: text("note"),
});

export const ghlEvents = pgTable("ghl_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  webhookId: text("webhook_id").notNull().unique(),
  type: text("type").notNull(),
  locationId: text("location_id"),
  accountId: bigint("account_id", { mode: "number" }),
  leads: integer("leads").notNull().default(0),
  summary: text("summary").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const triggerEvents = ["held", "returned", "signed"] as const;
export type TriggerEvent = (typeof triggerEvents)[number];

/** A GHL workflow whose trigger is "Fernway lead": where to send which arrivals. */
export const workflowTriggers = pgTable("workflow_triggers", {
  id: text("id").primaryKey(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  locationId: text("location_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  events: text("events").array().$type<TriggerEvent[]>().notNull(),
  targetUrl: text("target_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const triggerSends = pgTable("trigger_sends", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  triggerId: text("trigger_id").notNull(),
  shipmentId: bigint("shipment_id", { mode: "number" }).notNull(),
  event: text("event").$type<TriggerEvent>().notNull(),
  tries: smallint("tries").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  givenUpAt: timestamp("given_up_at", { withTimezone: true }),
  lastStatus: smallint("last_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const embedFields = ["firstName", "lastName", "email", "phone", "companyName", "message"] as const;
export type EmbedField = (typeof embedFields)[number];
export const embedThemes = ["light", "dark", "auto"] as const;
export type EmbedTheme = (typeof embedThemes)[number];

/** A Fernway form for any website: its public key, its route, its fields and where it may be shown. */
export const embedForms = pgTable("embed_forms", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  routeKey: text("route_key").notNull(),
  fields: text("fields").array().$type<EmbedField[]>().notNull(),
  theme: text("theme").$type<EmbedTheme>().notNull().default("light"),
  button: text("button").notNull().default("Send"),
  sites: text("sites").array().notNull().default([]),
  madeBy: text("made_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type ScoreState = "waiting" | "scored" | "skipped" | "failed";
export type ScoreGhlState = "waiting" | "written" | "skipped" | "failed";

/** Claude's read of one lead: its score (1 to 5), a line and up to three reasons, what it cost, and its note in GHL. */
export const leadScores = pgTable("lead_scores", {
  shipmentId: bigint("shipment_id", { mode: "number" }).primaryKey(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  state: text("state").$type<ScoreState>().notNull().default("waiting"),
  score: smallint("score"),
  summary: text("summary"),
  signals: text("signals").array().notNull().default([]),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  tries: smallint("tries").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  scoredAt: timestamp("scored_at", { withTimezone: true }),
  ghlState: text("ghl_state").$type<ScoreGhlState>().notNull().default("waiting"),
  ghlNoteId: text("ghl_note_id"),
  ghlTries: smallint("ghl_tries").notNull().default(0),
  ghlNextAt: timestamp("ghl_next_at", { withTimezone: true }).notNull().defaultNow(),
  ghlError: text("ghl_error"),
  ghlWrittenAt: timestamp("ghl_written_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What Fernway spent on Claude in one calendar month (UTC). */
export const claudeSpend = pgTable("claude_spend", {
  month: date("month").primaryKey(),
  calls: integer("calls").notNull().default(0),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  spentUsd: numeric("spent_usd", { precision: 12, scale: 6 }).notNull().default("0"),
});

/** The Google Sheet an account linked: its id and title, who linked it, and from when its leads are written. */
export const sheetLinks = pgTable("sheet_links", {
  accountId: bigint("account_id", { mode: "number" }).primaryKey(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  title: text("title").notNull(),
  madeBy: text("made_by").notNull(),
  since: timestamp("since", { withTimezone: true }).notNull().defaultNow(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** The route the tab "Leads in" sends its rows on; null when reading is off. */
  inRoute: text("in_route"),
  inReadAt: timestamp("in_read_at", { withTimezone: true }),
  inError: text("in_error"),
});

/** One lead's row in the linked sheet. */
export const sheetRows = pgTable("sheet_rows", {
  shipmentId: bigint("shipment_id", { mode: "number" }).primaryKey(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  rowNumber: integer("row_number"),
  printed: text("printed"),
  writtenAt: timestamp("written_at", { withTimezone: true }),
  tries: smallint("tries").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  givenUpAt: timestamp("given_up_at", { withTimezone: true }),
});

export const hookEvents = ["lead.picked_up", "lead.signed", "lead.held", "lead.returned", "lead.scored"] as const;
export type HookEvent = (typeof hookEvents)[number];

/** An account's own address that hears about its leads, with the events it asked for and its sealed signing secret. */
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  events: text("events").array().$type<HookEvent[]>().notNull(),
  secretSealed: text("secret_sealed").notNull(),
  madeBy: text("made_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One event to one endpoint: the body, as sent every time, and what the endpoint last answered. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  endpointId: bigint("endpoint_id", { mode: "number" }).notNull(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  event: text("event").$type<HookEvent | "fernway.test">().notNull(),
  shipmentId: bigint("shipment_id", { mode: "number" }),
  body: text("body").notNull(),
  state: text("state").$type<"waiting" | "delivered" | "failed">().notNull().default("waiting"),
  tries: smallint("tries").notNull().default(0),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  lastStatus: smallint("last_status"),
  lastAnswer: text("last_answer"),
  lastMs: integer("last_ms"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
