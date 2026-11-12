// The delivery worker: runs every try the queue hands it (the engine in @fernway/delivery), puts overdue shipments
// back on the queue every minute (the safety net), and writes a heartbeat to Redis every 10 s for the health check.
// Every hour it also removes the public site's leads older than 30 days, from GHL first (retention.ts).
// Leads of the Break it demo account run against the stand-in GHL (breakit.ts), never a real one, and go after a day.
import { MAX_TRIES } from "@fernway/core";
import {
  breakItTry,
  connectionFor,
  createDb,
  createDeliveryWorker,
  createGhlClient,
  createQueue,
  deliverTry,
  forgetOldGhlEvents,
  forgetOldTriggerSends,
  noteTriggerSends,
  sendDueTriggers,
  forgetOldSignIns,
  keyFrom,
  machine,
  recordIncidents,
  watch,
  mailer,
  noteLeadAlerts,
  noteWeeklyAlerts,
  oauthConfigFromEnv,
  sendDueAlerts,
  purgeExpired,
  shipments,
  sweep,
  createClaude,
  noteScores,
  scoreDue,
  writeScoresToGhl,
  MONTH_CAP_USD,
  createSheets,
  serviceKeyFrom,
  syncSheets,
  readSheetsIn,
  type Deps,
} from "@fernway/delivery";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";

const HEARTBEAT_KEY = "fernway:worker:heartbeat";
const BEAT_MS = 10_000;
const SWEEP_MS = 60_000;
const PURGE_MS = 60 * 60_000;
const ALERTS_MS = 60_000;
// Every 20 minutes, so each person's Monday 08:00 to 08:59 is seen at least twice (the week's row is made once).
const WEEKLY_MS = 20 * 60_000;

const need = (name: string) => {
  const v = process.env[name];
  if (!v) {
    console.error(`worker: ${name} is not set`);
    process.exit(1);
  }
  return v;
};

const commit = process.env.APP_COMMIT ?? "dev";
const siteAccount = Number(need("FERNWAY_SITE_ACCOUNT"));
const demoAccount = Number(need("FERNWAY_DEMO_ACCOUNT"));
const redis = new Redis(need("REDIS_URL"), { maxRetriesPerRequest: null });
redis.on("error", (err) => console.error(`worker: redis error: ${err.message}`));
const { pool, db } = createDb(need("DATABASE_URL"));
const { queue, schedule } = createQueue(redis);

const tokenKey = keyFrom(need("FERNWAY_TOKEN_KEY"));
const oauth = oauthConfigFromEnv(process.env, tokenKey);
const deps: Deps = {
  db,
  ghl: createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }),
  // The account's GHL sub-account (OAuth); an account that never connected holds its leads with that reason.
  connectionFor: (accountId) => connectionFor(db, oauth, accountId),
  schedule,
};

// A Break it lead (the demo account) never meets a real GHL: its tries go to the stand-in.
async function runTry(shipmentId: number, tryNumber: number) {
  const [s] = await db.select({ accountId: shipments.accountId }).from(shipments).where(eq(shipments.id, shipmentId));
  if (s?.accountId === demoAccount) return breakItTry(deps, shipmentId, tryNumber);
  return deliverTry(deps, shipmentId, tryNumber);
}
const worker = createDeliveryWorker(redis, (job) => runTry(job.shipmentId, job.try));
worker.on("failed", (job, err) => console.error(`worker: try ${job?.data.try} of shipment ${job?.data.shipmentId} crashed: ${err.message}`));

async function beat() {
  await redis.set(HEARTBEAT_KEY, JSON.stringify({ at: new Date().toISOString(), commit }), "PX", BEAT_MS * 3);
}

await beat();
console.log(`worker ${commit}: up, delivering (${MAX_TRIES} tries over 24 h), heartbeat every ${BEAT_MS / 1000} s`);
const beating = setInterval(() => beat().catch((e) => console.error(`worker: heartbeat failed: ${e.message}`)), BEAT_MS);
const sweeping = setInterval(() => {
  sweep(deps)
    .then((n) => n && console.log(`worker: put ${n} overdue shipment(s) back on the queue`))
    .catch((e) => console.error(`worker: sweep failed: ${e.message}`));
}, SWEEP_MS);
const purge = () =>
  purgeExpired({ ...deps, connectionFor: async () => ({ locationId: "breakit", accessToken: async () => "", refresh: async () => {} }), ghl: { ...deps.ghl, remove: async () => ({ gone: true, status: 200 }) } }, demoAccount, 1)
    .then((r) => r.removed && console.log(`worker: Break it leads past a day: ${r.removed} removed`))
    .catch((e) => console.error(`worker: Break it retention failed: ${e.message}`))
    .then(() => purgeExpired(deps, siteAccount))
    .then((r) => (r.removed || r.waiting) && console.log(`worker: site leads past 30 days: ${r.removed} removed, ${r.waiting} kept until GHL can be reached`))
    .catch((e) => console.error(`worker: retention failed: ${e.message}`));
void purge();
const purging = setInterval(purge, PURGE_MS);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    clearInterval(beating);
    clearInterval(sweeping);
    clearInterval(purging);
    await worker.close().catch(() => {});
    await queue.close().catch(() => {});
    await redis.del(HEARTBEAT_KEY).catch(() => {});
    await redis.quit().catch(() => {});
    await pool.end().catch(() => {});
    console.log(`worker: stopped (${signal})`);
    process.exit(0);
  });
}

// Alert emails: who should hear about a held or returned lead (every minute), whose Monday 08:00 it is (every hour),
// then what is due is sent. Only with a way to send (RESEND_API_KEY, or the outbox in local work and CI).
const send = mailer({
  resendKey: process.env.RESEND_API_KEY,
  outbox: process.env.FERNWAY_MAIL_OUTBOX === "on"
    ? async (m) => { await redis.multi().lpush("fernway:outbox", JSON.stringify({ ...m, at: new Date().toISOString() })).ltrim("fernway:outbox", 0, 99).exec(); }
    : undefined,
});
if (send) {
  const appUrl = (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");
  const alertRun = () => noteLeadAlerts(db, [demoAccount, siteAccount])
    .then(() => sendDueAlerts({ db, send, key: tokenKey, appUrl }))
    .then((r) => (r.sent || r.failed || r.gaveUp) && console.log(`worker: alerts sent ${r.sent}, to retry ${r.failed}, given up ${r.gaveUp}`))
    .catch((e) => console.error(`worker: alerts failed: ${e.message}`));
  setInterval(alertRun, ALERTS_MS);
  setInterval(() => noteWeeklyAlerts(db).catch((e) => console.error(`worker: weekly summary failed: ${e.message}`)), WEEKLY_MS);
  console.log(`worker ${commit}: alert emails on`);
}

// GHL workflows started by "Fernway lead": what arrived is noted, then sent to each workflow's trigger, every 20 s.
const TRIGGERS_MS = 20_000;
const triggerAppUrl = (process.env.APP_URL ?? "https://fernway.jeromebadour.com").replace(/\/$/, "");
setInterval(() => {
  noteTriggerSends(db)
    .then(() => sendDueTriggers({ db, connectionFor: deps.connectionFor, key: tokenKey, appUrl: triggerAppUrl }))
    .then((r) => (r.sent || r.failed || r.gaveUp) && console.log(`worker: workflow triggers sent ${r.sent}, to retry ${r.failed}, given up ${r.gaveUp}`))
    .catch((e) => console.error(`worker: workflow triggers failed: ${e.message}`));
}, TRIGGERS_MS);

// Claude score, every 20 s: new leads of accounts that turned it on are noted, scored (never past the month's cap),
// and each score written to its GHL contact once the lead is signed for. Only with Fernway's own Claude key.
if (process.env.ANTHROPIC_API_KEY) {
  const claude = createClaude({ apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: process.env.FERNWAY_CLAUDE_API || undefined });
  const capUsd = Number(process.env.CLAUDE_MONTH_CAP_USD || MONTH_CAP_USD);
  let scoring = false;
  setInterval(() => {
    if (scoring) return;
    scoring = true;
    noteScores(db, [demoAccount])
      .then(() => scoreDue({ db, claude, capUsd }))
      .then((r) => (r.scored || r.retry || r.failed || r.skipped) && console.log(`worker: Claude scores ${r.scored}, to retry ${r.retry}, failed ${r.failed}, not scored ${r.skipped}`))
      .then(() => writeScoresToGhl({ db, ghl: deps.ghl, connectionFor: deps.connectionFor }))
      .then((r) => (r.written || r.retry || r.failed) && console.log(`worker: scores written to GHL ${r.written}, to retry ${r.retry}, failed ${r.failed}`))
      .catch((e) => console.error(`worker: Claude score failed: ${e.message}`))
      .finally(() => { scoring = false; });
  }, 20_000);
  console.log(`worker ${commit}: Claude score on (${claude.model}, cap $${capUsd} a month)`);
}

// Google Sheets, every 20 s: each linked sheet gets a row for every new lead, rewritten when the lead changes. Only
// with Fernway's own service account key.
const sheetsKey = serviceKeyFrom(process.env.GOOGLE_SHEETS_KEY);
if (sheetsKey) {
  const sheets = createSheets({ key: sheetsKey, baseUrl: process.env.FERNWAY_GOOGLE_API || undefined, tokenUrl: process.env.FERNWAY_GOOGLE_TOKEN || undefined });
  let writing = false;
  setInterval(() => {
    if (writing) return;
    writing = true;
    syncSheets({ db, sheets })
      .then((r) => (r.written || r.updated || r.retry || r.failed) && console.log(`worker: sheet rows written ${r.written}, rewritten ${r.updated}, to retry ${r.retry}, given up ${r.failed}`))
      .catch((e) => console.error(`worker: Google Sheets failed: ${e.message}`))
      .finally(() => { writing = false; });
  }, 20_000);
  // "Leads in", every minute: new rows become leads, and each row shows its waybill and state.
  let reading = false;
  setInterval(() => {
    if (reading) return;
    reading = true;
    readSheetsIn({ db, sheets, deps })
      .then((r) => (r.sent || r.refused) && console.log(`worker: sheet rows in: ${r.sent} sent, ${r.refused} refused, ${r.refreshed} rows updated`))
      .catch((e) => console.error(`worker: Leads in failed: ${e.message}`))
      .finally(() => { reading = false; });
  }, 60_000);
  console.log(`worker ${commit}: Google Sheets on (${sheets.email})`);
}

// Old sign-ins and spent email links go after their time (the Privacy Policy says how long), every hour.
setInterval(() => {
  forgetOldSignIns(db)
    .then((r) => (r.sessions || r.links || r.invites) && console.log(`worker: old sign-ins removed ${r.sessions}, email links ${r.links}, invites ${r.invites}`))
    .catch((e) => console.error(`worker: sign-in clean-up failed: ${e.message}`));
  forgetOldGhlEvents(db)
    .then((n) => n && console.log(`worker: GHL events older than 30 days removed ${n}`))
    .catch((e) => console.error(`worker: GHL event clean-up failed: ${e.message}`));
  forgetOldTriggerSends(db)
    .then((n) => n && console.log(`worker: workflow trigger calls older than 30 days removed ${n}`))
    .catch((e) => console.error(`worker: trigger clean-up failed: ${e.message}`));
}, PURGE_MS);

// The watchers, every minute: a watcher gone wrong opens an incident (one per watcher), raised if it gets worse and
// closed when it is fine again. The worker's own watcher is left out here: a stopped worker can't record itself, and
// the operator console reads it live from the heartbeat.
const WATCH_MS = 60_000;
setInterval(async () => {
  try {
    const m = await machine("/");
    const w = (await watch(db, { at: new Date().toISOString(), ...m, redisBytes: null, webCommit: "", workerCommit: commit, workerBeatAt: new Date().toISOString(), jobs: null }, Date.now(), Number(process.env.CLAUDE_MONTH_CAP_USD || MONTH_CAP_USD)))
      .filter((x) => x.key !== "worker");
    const r = await recordIncidents(db, w);
    if (r.opened || r.closed) console.log(`worker: incidents opened ${r.opened}, closed ${r.closed}`);
  } catch (e) {
    console.error(`worker: watchers failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}, WATCH_MS);
