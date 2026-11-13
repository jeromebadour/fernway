#!/usr/bin/env node
// A stand-in for GHL's API, for CI and local pictures only (never on the box): FERNWAY_GHL_API=http://127.0.0.1:4010
// points the web app and the worker at it. It answers the calls Fernway makes like GHL does: contact upsert (matched
// by email), notes, opportunities, appointments, and free slots (weekdays 09:00 to 17:00 New York, every 30 min,
// minus booked ones), and tags. GET /__calls lists what it was asked. It also stands in for Claude's Messages API
// (POST /v1/messages, key ci-claude-key): every lead scores 4; GET /__claude lists what Claude was sent. And for
// Google: POST /token (a service account's signed sign-in) and the Sheets API on one shared sheet,
// 1CiSharedSheetAbcdefghijkl ("CI leads"); any other sheet is not shared (403). GET /__sheet is its Fernway leads tab.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4010);
const contacts = new Map();
const booked = new Set();
const calls = [];
let n = 0;

function slotsBetween(from, to) {
  const out = {};
  for (let t = Math.ceil(from / 1_800_000) * 1_800_000; t < to; t += 1_800_000) {
    const d = new Date(t);
    const ny = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = ny.getDay();
    const mins = ny.getHours() * 60 + ny.getMinutes();
    if (day === 0 || day === 6 || mins < 9 * 60 || mins >= 17 * 60 || booked.has(d.toISOString())) continue;
    const key = d.toISOString().slice(0, 10);
    (out[key] ??= { slots: [] }).slots.push(d.toISOString());
  }
  return out;
}

// What each contact was last upserted with.
const held = new Map();
// Each workflow trigger Fernway fired.
const fired = [];
// What the stand-in Claude was sent, and each contact's tags.
const claude = [];
const tags = new Map();
// Fernway's webhooks, as received.
const hooks = [];
// The stand-in Google sheet: its tabs, each a list of rows.
const sheet = new Map([["Sheet1", []]]);
const SHARED = "1CiSharedSheetAbcdefghijkl";
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let body = "";
  for await (const chunk of req) body += chunk;
  // Google's sign-in is form-encoded; everything else is JSON.
  let json = {};
  try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
  // Asking what it was asked is not a GHL call: it isn't counted.
  if (url.pathname === "/__calls") return send(res, 200, calls);
  if (url.pathname === "/__fired") return send(res, 200, fired);
  // Every contact as it was last upserted, to check what reached GHL's own fields (an address, say).
  if (url.pathname === "/__contacts") return send(res, 200, [...held.values()]);
  if (url.pathname === "/__claude") return send(res, 200, claude);
  // A receiver for Fernway's webhooks: keeps each call with its headers and raw body.
  if (url.pathname === "/__hooks") return send(res, 200, hooks);
  if (req.method === "POST" && url.pathname === "/hook") { hooks.push({ headers: req.headers, body }); return send(res, 200, { received: true }); }
  if (url.pathname === "/__sheet") return send(res, 200, sheet.get("Fernway leads") ?? []);
  // The test types a row into Leads in, the way a person would.
  if (req.method === "POST" && url.pathname === "/__sheet-in") { (sheet.get("Leads in") ?? []).push(json.row); return send(res, 200, sheet.get("Leads in")); }
  if (url.pathname === "/__sheet-in") return send(res, 200, sheet.get("Leads in") ?? []);
  // The stand-in Google: any signed sign-in gets a token; the one shared sheet answers like the Sheets API.
  if (req.method === "POST" && url.pathname === "/token") {
    const assertion = new URLSearchParams(body).get("assertion") ?? "";
    return assertion.split(".").length === 3 ? send(res, 200, { access_token: "ya29.ci", expires_in: 3600 }) : send(res, 400, { error: "invalid_grant" });
  }
  const sh = url.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(:batchUpdate)?(?:\/values(:batchUpdate)?\/?(.*))?$/);
  if (sh) {
    if (req.headers.authorization !== "Bearer ya29.ci") return send(res, 401, { error: { message: "unauthenticated" } });
    if (sh[1] !== SHARED) return send(res, 403, { error: { message: "The caller does not have permission" } });
    if (sh[2]) { sheet.set(json.requests[0].addSheet.properties.title, []); return send(res, 200, {}); }
    if (sh[3]) {
      for (const d of json.data) {
        const m = d.range.match(/^'(.+)'!([A-Z])(\d+):[A-Z]\d+$/);
        const g = sheet.get(m[1]);
        const row = (g[Number(m[3]) - 1] ??= []);
        const start = m[2].charCodeAt(0) - 65;
        while (row.length < start) row.push("");
        d.values[0].forEach((v, i) => { row[start + i] = v; });
      }
      return send(res, 200, {});
    }
    if (!sh[4]) return send(res, 200, { properties: { title: "CI leads" }, sheets: [...sheet.keys()].map((t) => ({ properties: { title: t } })) });
    const append = sh[4].endsWith(":append");
    const m = decodeURIComponent(append ? sh[4].slice(0, -7) : sh[4]).match(/^'(.+)'!A(\d*)(?::[A-Z](\d*))?$/);
    const grid = sheet.get(m[1].replace(/''/g, "'")) ?? [];
    const from = m[2] ? Number(m[2]) : null;
    if (append) { grid.push(json.values[0]); return send(res, 200, { updates: { updatedRange: `'${m[1]}'!A${grid.length}:L${grid.length}` } }); }
    if (req.method === "PUT") { grid[from - 1] = json.values[0]; return send(res, 200, {}); }
    if (from) return send(res, 200, { values: grid[from - 1] ? [[grid[from - 1][0]]] : [] });
    if (decodeURIComponent(sh[4]).endsWith("A:A")) return send(res, 200, { values: grid.map((g) => [g[0]]) });
    return send(res, 200, { values: grid.map((g) => { const r = [...g]; while (r.length && !r[r.length - 1]) r.pop(); return r; }) });
  }
  if (url.pathname === "/__tags") return send(res, 200, Object.fromEntries([...tags].map(([k, v]) => [k, [...v]])));
  // The stand-in Claude: not a GHL call, so not counted with them.
  if (req.method === "POST" && url.pathname === "/v1/messages") {
    if (req.headers["x-api-key"] !== "ci-claude-key") return send(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    claude.push(json);
    return send(res, 200, {
      id: `msg_${claude.length}`, type: "message", role: "assistant", model: json.model, stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ score: 4, summary: "A business asking to start a trial soon.", signals: ["Clear need", "Work email domain"] }) }],
      usage: { input_tokens: 800, output_tokens: 60 },
    });
  }
  // A workflow trigger Fernway fired: kept apart from the lead calls (Break it counts those), with its token.
  if (req.method === "POST" && url.pathname.startsWith("/workflows-marketplace/triggers/execute/")) {
    fired.push({ path: url.pathname, auth: req.headers.authorization ?? null, body: json });
    return send(res, 200, { succeeded: true });
  }
  calls.push({ method: req.method, path: url.pathname });
  if (req.method === "POST" && url.pathname === "/contacts/upsert") {
    const key = json.email ?? json.phone;
    if (!contacts.has(key)) contacts.set(key, `c_${contacts.size + 1}`);
    held.set(contacts.get(key), json);
    return send(res, 200, { contact: { id: contacts.get(key) } });
  }
  // A contact as it was last upserted (Your record reads it); gone once deleted.
  const one = url.pathname.match(/^\/contacts\/([^/]+)$/);
  if (req.method === "GET" && one) {
    const c = held.get(one[1]);
    return c ? send(res, 200, { contact: { id: one[1], ...c, dateAdded: new Date().toISOString() } }) : send(res, 404, { message: "Contact not found" });
  }
  if (req.method === "DELETE" && one) held.delete(one[1]);
  const tagged = url.pathname.match(/^\/contacts\/([^/]+)\/tags$/);
  if (tagged && (req.method === "POST" || req.method === "DELETE")) {
    const have = tags.get(tagged[1]) ?? new Set();
    for (const t of json.tags ?? []) { if (req.method === "DELETE") have.delete(t); else have.add(t); }
    tags.set(tagged[1], have);
    return send(res, req.method === "POST" ? 201 : 200, { tags: [...have] });
  }
  if (req.method === "POST" && /^\/contacts\/[^/]+\/notes$/.test(url.pathname)) return send(res, 201, { note: { id: `n_${++n}` } });
  if (req.method === "POST" && url.pathname === "/opportunities/upsert") return send(res, 200, { opportunity: { id: `o_${++n}` } });
  if (req.method === "POST" && url.pathname === "/calendars/events/appointments") {
    const at = new Date(json.startTime).toISOString();
    if (booked.has(at)) return send(res, 422, { message: "The slot you have selected is no longer available." });
    booked.add(at);
    return send(res, 200, { id: `a_${++n}`, ...json });
  }
  const free = url.pathname.match(/^\/calendars\/([^/]+)\/free-slots$/);
  if (req.method === "GET" && free) {
    return send(res, 200, { ...slotsBetween(Number(url.searchParams.get("startDate")), Number(url.searchParams.get("endDate"))), traceId: "fake" });
  }
  if (req.method === "GET" && url.pathname === "/calendars/") {
    return send(res, 200, { calendars: [{ id: "cal_demo", name: "Fernway demo", slotDuration: 30 }, { id: "cal_x", name: "Free assessment", slotDuration: 45 }] });
  }
  if (req.method === "GET" && url.pathname === "/opportunities/pipelines") {
    return send(res, 200, { pipelines: [
      { id: "pipe_x", name: "Patients", stages: [{ id: "stage_x", name: "New booking" }, { id: "stage_y", name: "Assessment booked" }, { id: "stage_z", name: "Treatment plan" }] },
      { id: "pipe_w", name: "Corporate wellness", stages: [{ id: "stage_w1", name: "Enquiry" }, { id: "stage_w2", name: "Proposal sent" }] },
    ] });
  }
  if (req.method === "DELETE") return send(res, 200, { succeeded: true });
  send(res, 404, { message: `fake GHL has no ${req.method} ${url.pathname}` });
}).listen(port, "0.0.0.0", () => console.log(`fake GHL on :${port}`));
