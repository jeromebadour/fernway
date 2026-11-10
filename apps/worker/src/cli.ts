// Fernway's setup tool on the box, until the console exists (plan step 6). Runs inside the worker container:
//   docker compose --env-file /srv/fernway/.env exec worker node apps/worker/dist/cli.js <command> ...
//
//   account <name>                              make an account, print its id
//   connect-link <account>                      a signed Connect GHL link for that account, valid 30 minutes
//   pipelines <account>                         the connected sub-account's pipelines and stages
//   route <account> <key> <label> [<pipeline> <stage>] [tags,...]   add or change a route ("-" for no pipeline:
//                                                                    the lead becomes a contact only, with the tags)
//   send-test <account> <route> <email>         send one test lead through the real queue
//   waybill <number>                            a shipment and every scan, e.g. "FW 26 00002"
import { formatWaybill, parseWaybill } from "@fernway/core";
import {
  accounts,
  connectionFor,
  createDb,
  createGhlClient,
  createQueue,
  ingestLead,
  keyFrom,
  oauthConfigFromEnv,
  routes,
  scans,
  shipments,
  signValue,
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
      const list = await createGhlClient().listPipelines(conn);
      if (!list.length) console.log("no pipelines in this sub-account yet: make one in GHL (Opportunities, Pipelines)");
      for (const p of list) {
        console.log(`${p.name}  pipeline ${p.id}`);
        for (const st of p.stages) console.log(`  ${st.name}  stage ${st.id}`);
      }
      break;
    }
    case "route": {
      const [acc, rkey, label, ...rest] = args;
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
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      const [existing] = await db.select().from(routes).where(and(eq(routes.accountId, accountId), eq(routes.key, rkey!)));
      if (existing) await db.update(routes).set(values).where(eq(routes.id, existing.id));
      else await db.insert(routes).values(values);
      console.log(`route ${rkey} (${label}): ${pipelineId ? `pipeline ${pipelineId}, stage ${stageId}` : "contact only"}, tags ${values.tags.join(", ") || "none"}`);
      break;
    }
    case "send-test": {
      const [acc, route, email] = args;
      const accountId = accountArg(acc);
      if (!route || !email) fail("send-test <account> <route> <email>");
      const redis = new Redis(need("REDIS_URL"), { maxRetriesPerRequest: null });
      const { queue, schedule } = createQueue(redis);
      const r = await ingestLead(
        { db, ghl: createGhlClient(), connectionFor: (id) => connectionFor(db, oauth, id), schedule },
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
      fail("commands: account, connect-link, pipelines, route, send-test, waybill");
  }
} finally {
  await pool.end();
}
