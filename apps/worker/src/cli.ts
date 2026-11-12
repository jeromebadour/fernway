// Fernway's setup tool on the box, until the console exists (plan step 6). Runs inside the worker container:
//   docker compose --env-file /srv/fernway/.env exec worker node apps/worker/dist/cli.js <command> ...
//
//   account <name>                              make an account, print its id
//   connect-link <account>                      a signed Connect GHL link for that account, valid 30 minutes
//   pipelines <account>                         the connected sub-account's pipelines and stages
//   calendars <account>                         the connected sub-account's calendars, with their ids
//   route <account> <key> <label> [<pipeline> <stage>] [tags,...]   add or change a route ("-" for no pipeline:
//                                                                    the lead becomes a contact only, with the tags;
//                                                                    "calendar=<id>" anywhere makes it a booking route)
//   send-test <account> <route> <email>         send one test lead through the real queue
//   waybill <number>                            a shipment and every scan, e.g. "FW 26 00002"
//   apikey <account> <label>                    make an API key; shown once, only its hash is kept
//   apikeys <account>                           list an account's keys (prefix, label, last used, revoked)
//   revoke-apikey <prefix>                      stop a key at once
//   stripe-catalog                              makes or checks Fernway's plans in Stripe (test mode only): one
//                                               product and monthly price per plan, and the customer portal
//   staff-owner <email>                         makes that Fernway user the operator console's owner (the first
//                                               staff; more are added in the console). Opens with two-step on.
//   scoring <account> on|off                    Claude score for that account's new leads (the console does the same)
//   sheet <account> <link>|off                  link that account's Google Sheet (shared with Fernway's address), or unlink
//   sheet-in <account> <route>|off              read the linked sheet's tab Leads in, its rows sent on that route
//   hook <account> <label> <url> <events,...>   add a webhook endpoint (events: picked_up, signed, held, returned, scored);
//                                               prints its secret once
//   claude-spend                                what Fernway spent on Claude this month, against its cap
//   fake-connect <account>                      CI and local pictures only: ties the account to the fake GHL
//                                               (scripts/fake-ghl.mjs); refuses unless FERNWAY_GHL_API is set
import { formatWaybill, parseWaybill } from "@fernway/core";
import {
  accounts,
  apiKeys,
  catalog,
  connectionFor,
  createStripe,
  createApiKey,
  createDb,
  createGhlClient,
  createQueue,
  ghlConnections,
  ingestLead,
  keyFrom,
  lookupKey,
  PLANS,
  planKeys,
  oauthConfigFromEnv,
  revokeApiKey,
  routes,
  scans,
  seal,
  setScoring,
  createSheets,
  linkSheet,
  setSheetIn,
  saveHook,
  serviceKeyFrom,
  unlinkSheet,
  shipments,
  spendThisMonth,
  MONTH_CAP_USD,
  signValue,
  staff,
  users,
} from "@fernway/delivery";
import { and, asc, eq } from "drizzle-orm";
import { Redis } from "ioredis";

const [command, ...args] = process.argv.slice(2);
const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const fail = (message: string): never => {
  console.error(`STOPPED: ${message}`);
  process.exit(1);
};
const accountArg = (v: string | undefined) => (/^\d+$/.test(v ?? "") ? Number(v) : fail("which account? a number, from `account`"));

const { pool, db } = createDb(need("DATABASE_URL"), 2);
const key = keyFrom(need("FERNWAY_TOKEN_KEY"));
const oauth = oauthConfigFromEnv(process.env, key);

try {
  switch (command) {
    case "account": {
      const name = args.join(" ").trim() || fail("a name, e.g. account Fernway Demo");
      const [a] = await db.insert(accounts).values({ name }).returning();
      console.log(`account ${a!.id}: ${a!.name}`);
      break;
    }
    case "staff-owner": {
      const email = (args[0] ?? fail("an email, e.g. staff-owner jerome@jeromebadour.com")).trim().toLowerCase();
      const [u] = await db.select().from(users).where(eq(users.email, email));
      if (!u) fail(`no Fernway user has ${email}; sign up first`);
      await db.insert(staff).values({ userId: u!.id, role: "owner" }).onConflictDoUpdate({ target: staff.userId, set: { role: "owner" } });
      console.log(`staff owner: ${u!.name} (${u!.email})${u!.totpEnabledAt ? "" : "; turn two-step sign-in on before the console opens"}`);
      break;
    }
    case "apikey": {
      const accountId = accountArg(args[0]);
      const label = args.slice(1).join(" ").trim() || fail("a label, e.g. apikey 1 Website");
      const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!a) fail(`no account ${accountId}`);
      const { key: apiKey, prefix } = await createApiKey(db, accountId, label);
      console.log(`API key ${prefix} for "${a!.name}" (${label}). It is shown once; keep it somewhere safe:\n${apiKey}`);
      break;
    }
    case "apikeys": {
      const accountId = accountArg(args[0]);
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.accountId, accountId)).orderBy(asc(apiKeys.id));
      if (!rows.length) console.log(`no keys for account ${accountId}`);
      for (const r of rows) {
        const used = r.lastUsedAt ? `last used ${r.lastUsedAt.toISOString()}` : "never used";
        console.log(`${r.prefix}  ${r.label}  ${used}${r.revokedAt ? `  REVOKED ${r.revokedAt.toISOString()}` : ""}`);
      }
      break;
    }
    case "revoke-apikey": {
      const prefix = /^[a-z0-9]{8}$/.test(args[0] ?? "") ? args[0]! : fail("which key? its 8-letter prefix, from `apikeys`");
      console.log((await revokeApiKey(db, prefix)) ? `key ${prefix} revoked` : `no live key ${prefix}`);
      break;
    }
    case "stripe-catalog": {
      const stripe = createStripe(need("STRIPE_SECRET_KEY"));
      const c = await catalog(stripe);
      for (const plan of planKeys) {
        const p = await stripe.prices.retrieve(c.prices[plan]);
        console.log(`${PLANS[plan].name.padEnd(8)} ${lookupKey(plan).padEnd(24)} ${p.id}  $${(p.unit_amount ?? 0) / 100} ${p.currency.toUpperCase()} a ${p.recurring?.interval}  ${p.livemode ? "LIVE" : "test mode"}`);
      }
      console.log(`portal   ${c.portalConfig}`);
      break;
    }
    case "connect-link": {
      const accountId = accountArg(args[0]);
      const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!a) fail(`no account ${accountId}`);
      const t = signValue(key, "setup", { accountId }, 30 * 60_000);
      console.log(`Connect GHL for "${a!.name}" (valid 30 minutes):\n${need("APP_URL").replace(/\/$/, "")}/api/connect/start?t=${t}`);
      break;
    }
    case "pipelines": {
      const conn = (await connectionFor(db, oauth, accountArg(args[0]))) ?? fail("that account has no GHL connection yet");
      const list = await createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }).listPipelines(conn);
      if (!list.length) console.log("no pipelines in this sub-account yet: make one in GHL (Opportunities, Pipelines)");
      for (const p of list) {
        console.log(`${p.name}  pipeline ${p.id}`);
        for (const st of p.stages) console.log(`  ${st.name}  stage ${st.id}`);
      }
      break;
    }
    case "fake-connect": {
      if (!process.env.FERNWAY_GHL_API) fail("only with the fake GHL (FERNWAY_GHL_API): this box talks to the real one");
      const accountId = accountArg(args[0]);
      const values = {
        accountId, locationId: `loc_fake_${accountId}`, scopes: "fake", status: "connected" as const, lastError: null,
        accessTokenEnc: seal(key, "fake-access"), refreshTokenEnc: seal(key, "fake-refresh"), expiresAt: new Date(Date.now() + 365 * 86_400_000),
      };
      await db.insert(ghlConnections).values(values).onConflictDoUpdate({ target: ghlConnections.accountId, set: values });
      console.log(`account ${accountId}: tied to the fake GHL at ${process.env.FERNWAY_GHL_API}`);
      break;
    }
    case "calendars": {
      const conn = (await connectionFor(db, oauth, accountArg(args[0]))) ?? fail("that account has no GHL connection yet");
      const list = await createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }).listCalendars(conn);
      if (!list.length) console.log("no calendars in this sub-account yet: make one in GHL (Settings, Calendars)");
      for (const c of list) console.log(`${c.name}  calendar ${c.id}${c.minutes ? `  ${c.minutes} min` : ""}`);
      break;
    }
    case "route": {
      const calendarArg = args.find((a) => a.startsWith("calendar="));
      const [acc, rkey, label, ...rest] = args.filter((a) => a !== calendarArg);
      const calendarId = calendarArg ? calendarArg.slice("calendar=".length) : null;
      const accountId = accountArg(acc);
      if (!rkey || !label) fail("route <account> <key> <label> [<pipeline> <stage> | -] [tags]");
      const [pipelineId, stageId, tags] = rest[0] === "-" ? [undefined, undefined, rest[1]] : rest;
      if (pipelineId && !stageId) fail("a pipeline needs its stage too; use - for a contact-only route");
      const values = {
        accountId,
        key: rkey!,
        label: label!,
        pipelineId: pipelineId ?? null,
        stageId: stageId ?? null,
        calendarId,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      const [existing] = await db.select().from(routes).where(and(eq(routes.accountId, accountId), eq(routes.key, rkey!)));
      if (existing) await db.update(routes).set(values).where(eq(routes.id, existing.id));
      else await db.insert(routes).values(values);
      console.log(`route ${rkey} (${label}): ${pipelineId ? `pipeline ${pipelineId}, stage ${stageId}` : "contact only"}, tags ${values.tags.join(", ") || "none"}${calendarId ? `, books on calendar ${calendarId}` : ""}`);
      break;
    }
    case "send-test": {
      const [acc, route, email] = args;
      const accountId = accountArg(acc);
      if (!route || !email) fail("send-test <account> <route> <email>");
      const redis = new Redis(need("REDIS_URL"), { maxRetriesPerRequest: null });
      const { queue, schedule } = createQueue(redis);
      const r = await ingestLead(
        { db, ghl: createGhlClient({ baseUrl: process.env.FERNWAY_GHL_API }), connectionFor: (id) => connectionFor(db, oauth, id), schedule },
        accountId,
        {
          idempotencyKey: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          source: "api",
          route,
          contact: { firstName: "Test", lastName: "Lead", email, companyName: "Fernway test" },
        },
      );
      await queue.close();
      await redis.quit();
      if (!r.ok) fail(r.problems.join("; "));
      if (r.ok) console.log(`picked up ${r.waybill.number}; the worker sends it now. Read it with: waybill "${r.waybill.number}"`);
      break;
    }
    case "scoring": {
      const acc = accountArg(args[0]);
      const on = args[1] === "on" ? true : args[1] === "off" ? false : fail("on or off, e.g. scoring 1 on");
      const [a] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, acc));
      if (!a) fail(`no account ${acc}`);
      await setScoring(db, { accountId: acc, userId: null, name: "Fernway (setup tool)", role: "owner" }, on);
      console.log(`account ${acc} (${a!.name}): Claude score ${on ? "on; leads picked up from now are scored" : "off"}`);
      break;
    }
    case "sheet": {
      const acc = accountArg(args[0]);
      const m = { accountId: acc, userId: null, name: "Fernway (setup tool)", role: "owner" as const };
      if (args[1] === "off") { await unlinkSheet(db, m); console.log(`account ${acc}: sheet unlinked`); break; }
      const key = serviceKeyFrom(process.env.GOOGLE_SHEETS_KEY) ?? fail("GOOGLE_SHEETS_KEY is not set");
      const r = await linkSheet(db, createSheets({ key: key!, baseUrl: process.env.FERNWAY_GOOGLE_API || undefined, tokenUrl: process.env.FERNWAY_GOOGLE_TOKEN || undefined }), m, args[1] ?? "");
      if (!r.ok) fail(r.problems.join("; "));
      if (r.ok) console.log(`account ${acc}: linked "${r.title}"; new leads are written to the tab Fernway leads`);
      break;
    }
    case "sheet-in": {
      const acc = accountArg(args[0]);
      const m = { accountId: acc, userId: null, name: "Fernway (setup tool)", role: "owner" as const };
      const key = serviceKeyFrom(process.env.GOOGLE_SHEETS_KEY);
      const sheets = key ? createSheets({ key, baseUrl: process.env.FERNWAY_GOOGLE_API || undefined, tokenUrl: process.env.FERNWAY_GOOGLE_TOKEN || undefined }) : null;
      const r = await setSheetIn(db, sheets, m, args[1] === "off" ? null : (args[1] ?? fail("a route, or off")));
      if (!r.ok) fail(r.problems.join("; "));
      console.log(args[1] === "off" ? `account ${acc}: Leads in off` : `account ${acc}: Leads in on; its rows become leads on ${args[1]}`);
      break;
    }
    case "hook": {
      const acc = accountArg(args[0]);
      const [label, url, list] = [args[1], args[2], args[3]];
      if (!label || !url || !list) fail("hook <account> <label> <url> <events,...>");
      const insecure = (process.env.FERNWAY_WEBHOOK_INSECURE_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const r = await saveHook(db, key, { accountId: acc, userId: null, name: "Fernway (setup tool)", role: "owner" }, { label: label!, url: url!, events: list!.split(",").map((e) => `lead.${e.trim()}`) }, insecure);
      if (!r.ok) fail(r.problems.join("; "));
      if (r.ok) { console.log(`endpoint ${r.id} added; its secret (shown once):`); console.log(r.secret); }
      break;
    }
    case "claude-spend": {
      const s = await spendThisMonth(db);
      const cap = Number(process.env.CLAUDE_MONTH_CAP_USD ?? MONTH_CAP_USD);
      console.log(`${s.month.slice(0, 7)}: ${s.calls} calls, $${s.spentUsd.toFixed(4)} of $${cap.toFixed(2)}`);
      break;
    }
    case "waybill": {
      const n = parseWaybill(args.join(" ")) ?? fail('a waybill number, e.g. waybill "FW 26 00002"');
      const [s] = await db.select().from(shipments).where(and(eq(shipments.waybillYear, n.year), eq(shipments.waybillSeq, n.seq)));
      if (!s) fail(`no waybill ${formatWaybill(n)}`);
      console.log(`${formatWaybill(n)}  ${s!.state}${s!.holdReason ? ` (${s!.holdReason})` : ""}  tries ${s!.tries}`);
      console.log(`GHL contact ${s!.ghlContactId ?? "-"}  opportunity ${s!.ghlOpportunityId ?? "-"}`);
      const list = await db.select().from(scans).where(eq(scans.shipmentId, s!.id)).orderBy(asc(scans.id));
      for (const sc of list) {
        const t = sc.at.toISOString().slice(11, 23);
        const answer = sc.answerStatus ? ` GHL ${sc.answerStatus}` : "";
        console.log(`  ${t}  ${sc.kind.padEnd(15)}${sc.try ? ` try ${sc.try}` : ""}${answer}  ${sc.note ?? ""}`);
      }
      break;
    }
    default:
      fail("commands: account, connect-link, pipelines, calendars, route, send-test, waybill, apikey, apikeys, revoke-apikey, stripe-catalog, staff-owner, scoring, sheet, sheet-in, hook, claude-spend, fake-connect");
  }
} finally {
  await pool.end();
}
