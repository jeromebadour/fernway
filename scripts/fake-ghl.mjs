#!/usr/bin/env node
// A stand-in for GHL's API, for CI and local pictures only (never on the box): FERNWAY_GHL_API=http://127.0.0.1:4010
// points the web app and the worker at it. It answers the calls Fernway makes like GHL does: contact upsert (matched
// by email), notes, opportunities, appointments, and free slots (weekdays 09:00 to 17:00 New York, every 30 min,
// minus booked ones). GET /__calls lists what it was asked.
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
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  // Asking what it was asked is not a GHL call: it isn't counted.
  if (url.pathname === "/__calls") return send(res, 200, calls);
  if (url.pathname === "/__fired") return send(res, 200, fired);
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
