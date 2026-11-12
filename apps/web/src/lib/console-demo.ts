import "server-only";
// The customer console's public demo: an invented clinic, Harbor Physio, with 41 days of invented leads. Nothing is
// stored: every lead is worked out from its place in line and the time now, so the board always reads as live, and the
// same lead keeps its number, name and story between visits.
import { formatWaybill, parseWaybill } from "@fernway/core";
import { costOf, scoreTag, scoreWords, type AuditAction, type AuditGroup, type AuditTarget, type BoardView, type LeadScore, type LeadView, type LogRow, type LogState, type RouteRow, type ScoreView, type SheetView, type ShipmentState } from "@fernway/delivery";
import type { ConsoleData, ConsoleWho } from "./console-data";
import { demoWhen } from "./operator-demo";

const N = 2290;
const TOP = 18_400; // the newest lead's waybill number; older ones count down
const LOCATION = "KM3r8Vqo4Mi3e8uNAv1w";
const names: [string, string, string][] = [
  ["Ingrid", "Moss", "Fjordline Rowing"], ["Tom", "Whitfield", "Cedar Lane Vets"], ["Priya", "Nair", "Lumen Studio"], ["Marco", "Bellini", "Bellini & Co"],
  ["Hanna", "Kowalski", "Northgate Gym"], ["Lucas", "Ferreira", "Porto Runners"], ["Emma", "Clarke", "Clarke Dental"], ["Oskar", "Lund", "Lund Carpentry"],
  ["Sofia", "Rossi", "Rossi Yoga"], ["James", "Okafor", "Okafor Legal"], ["Mia", "Becker", "Becker Bakes"], ["Noah", "Jensen", "Jensen Bikes"],
  ["Ava", "Murphy", "Murphy Florals"], ["Leo", "Novak", "Novak Physio"], ["Clara", "Dubois", "Dubois Studio"], ["Felix", "Wagner", "Wagner Tiles"],
];
const routes = [
  { id: 1, key: "booking", label: "Booking requests", tags: ["booking", "website"], pipelineId: "pipe_patients", stageId: "stage_new", calendarId: null },
  { id: 2, key: "contact", label: "Contact form", tags: ["contact"], pipelineId: null, stageId: null, calendarId: null },
  { id: 3, key: "assessment", label: "Free assessment", tags: ["assessment"], pipelineId: "pipe_patients", stageId: "stage_assessed", calendarId: "cal_assessment" },
];
const reasons = {
  phone: '{"message":"The phone number is not valid for the country of the location"}',
  email: '{"message":"Email is invalid"}',
  stage: '{"message":"Pipeline stage not found"}',
};
const readableOf = (r: string) => (JSON.parse(r) as { message: string }).message;

type Lead = {
  i: number; id: number; seq: number; waybill: string; first: string; last: string; company: string; email: string; phone: string;
  route: (typeof routes)[number]; source: string; state: ShipmentState; tries: number; created: number; updated: number;
  signedAt: number | null; reason: string | null; nextAt: number | null;
};

const MIN = 60_000;
/** Lead i (0 is the newest), worked out the same way every time. */
function lead(i: number, now: number): Lead {
  const [first, last, company] = names[i % names.length]!;
  // About one lead every 26 minutes, busier in the day than at night.
  const created = now - (i * 26 + ((i * 37) % 13) + 3) * MIN - ((i * 7919) % 50_000);
  const route = routes[[0, 0, 0, 0, 0, 0, 1, 1, 2, 2][i % 10]!]!;
  const source = route.key === "contact" ? "api" : route.key === "assessment" ? "embed" : i % 3 === 0 ? "wordpress" : "form";
  let state: ShipmentState = "signed", reason: string | null = null, nextAt: number | null = null;
  let tries = i % 23 === 0 ? 2 : 1;
  if (i === 0) state = "in_transit";
  else if (i === 1 || i === 5) { state = "waiting"; tries = 3; nextAt = now + (i === 1 ? 3 : 7) * MIN; }
  else if ([3, 17, 29].includes(i)) { state = "held"; reason = reasons.phone; }
  else if ([41, 58].includes(i)) { state = "held"; reason = reasons.email; }
  else if (i === 70) { state = "held"; reason = reasons.stage; }
  else if (i === 88) { state = "returned"; tries = 8; }
  const signedAt = state === "signed" ? created + (tries === 2 ? 31_900 : 900 + ((i * 131) % 900)) : null;
  const updated = signedAt ?? (state === "held" ? created + 1_400 : state === "returned" ? created + 22 * 60 * MIN : created + 40_000);
  const seq = TOP - i;
  return {
    i, id: 900_000 + seq, seq, waybill: formatWaybill({ year: 26, seq }), first, last, company,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${(i % 97) + 1}@example.com`, phone: `+44 20 7946 ${String(1000 + ((i * 53) % 9000)).padStart(4, "0")}`,
    route, source, state, tries, created, updated, signedAt, reason, nextAt,
  };
}
const all = (now: number) => Array.from({ length: N }, (_, i) => lead(i, now));

// Lead score: Harbor Physio turned it on 14 days ago; every lead since then has Claude's read, worked out like the rest.
const SCORE_ON = 14 * 1440 * MIN;
const scorePattern = [4, 3, 5, 3, 2, 4, 3, 5, 1, 4, 3, 2, 4, 5, 3, 4, 2, 3];
const reads: Record<number, { summary: string; signals: string[] }[]> = {
  5: [{ summary: "A runner with a sore knee asking for the first free slot this week.", signals: ["Asks for a slot this week", "Clear injury, clear need", "Gave a phone number"] },
    { summary: "An office team lead booking assessments for four staff with back pain.", signals: ["Several patients at once", "Work email domain", "Wants dates now"] }],
  4: [{ summary: "Someone with shoulder pain after a fall, asking how soon they can come in.", signals: ["Clear need", "Asks about timing"] },
    { summary: "A cyclist recovering from a broken wrist, looking for a course of treatment.", signals: ["Clear need", "Ongoing treatment, not a one-off"] }],
  3: [{ summary: "Asking about prices and insurance before deciding to book.", signals: ["Interested, no date yet", "Price question first"] },
    { summary: "A parent asking whether the clinic treats teenagers' sports injuries.", signals: ["Real interest", "No injury described yet"] }],
  2: [{ summary: "A general question about opening hours, no treatment named.", signals: ["No treatment named", "No time asked for"] }],
  1: [{ summary: "A marketing agency offering website services to the clinic.", signals: ["Selling to the clinic", "Not a patient"] }],
};
function demoScore(l: Lead, now: number): LeadScore | null {
  if (l.created < now - SCORE_ON) return null;
  if (l.state === "in_transit") return { state: "waiting", score: null, word: null, summary: null, signals: [], model: null, costUsd: null, scoredAt: null, why: null, ghl: "waiting", ghlError: null, tag: null };
  const score = scorePattern[l.i % scorePattern.length]!;
  const r = reads[score]![l.i % reads[score]!.length]!;
  const ghl = l.state === "signed" ? "written" : l.state === "waiting" ? "waiting" : "skipped";
  return {
    state: "scored", score, word: scoreWords[score]!, summary: r.summary, signals: r.signals, model: "claude-haiku-5-5",
    costUsd: costOf("claude-haiku-5-5", 760 + (l.i % 90), 58 + (l.i % 21)), scoredAt: iso(l.created + 2_600 + ((l.i * 97) % 1500)),
    why: null, ghl, ghlError: ghl === "skipped" ? "the lead is not in GHL" : null, tag: scoreTag(score),
  };
}
// Google Sheets: Jonas linked the clinic's sheet 6 days ago; each lead since then has its row.
function sheetView(now: number): SheetView {
  const since = now - 6 * 1440 * MIN;
  const mine = all(now).filter((l) => l.created >= since && l.state !== "in_transit");
  return {
    serviceEmail: "fernway-sheets@fernway-514517.iam.gserviceaccount.com",
    link: { spreadsheetId: "1HpXr4bQ9mTz7wLkVn2sYc8dFg0aJe5uRiOq3NhB6tCv", title: "Harbor Physio leads 2026", url: "https://docs.google.com/spreadsheets/d/1HpXr4bQ9mTz7wLkVn2sYc8dFg0aJe5uRiOq3NhB6tCv/edit",
      madeBy: "Jonas Berg", since: iso(since), lastOkAt: iso(mine[0]?.updated ?? now), lastError: null },
    rows: { written: mine.length, waiting: 1, givenUp: 0 },
    in: { route: "contact", routeLabel: "Contact form", readAt: iso(now - 34_000), error: null, leads30: 23 },
    latest: mine.slice(0, 8).map((l, i) => ({ shipmentId: l.id, waybill: l.waybill, who: who(l), row: mine.length + 1 - i, at: iso(l.updated + 3_000) })),
  };
}

function scoreView(now: number): ScoreView {
  const start = new Date(now); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const leads = all(now).map((l) => ({ l, s: demoScore(l, now) })).filter((x) => x.s);
  const month = leads.filter(({ l }) => l.created >= start.getTime());
  const scored = month.filter(({ s }) => s!.state === "scored");
  const by = (n: number) => scored.filter(({ s }) => s!.score === n).length;
  return {
    on: true, since: iso(now - SCORE_ON),
    month: {
      scored: scored.length, byScore: { 1: by(1), 2: by(2), 3: by(3), 4: by(4), 5: by(5) },
      average: scored.length ? Math.round((scored.reduce((a, { s }) => a + s!.score!, 0) / scored.length) * 10) / 10 : null,
      costUsd: Math.round(scored.reduce((a, { s }) => a + s!.costUsd!, 0) * 1e6) / 1e6, waiting: month.length - scored.length, notScored: 0,
      inGhl: scored.filter(({ s }) => s!.ghl === "written").length,
    },
    latest: leads.filter(({ s }) => s!.state === "scored").slice(0, 8).map(({ l, s }) => ({ shipmentId: l.id, waybill: l.waybill, who: who(l), score: s!.score!, summary: s!.summary!, at: s!.scoredAt! })),
  };
}
const iso = (t: number) => new Date(t).toISOString();
const who = (l: Lead) => `${l.first} ${l.last}`;
const statesOf: Record<LogState, ShipmentState[]> = { moving: ["picked_up", "in_transit"], waiting: ["waiting"], signed: ["signed"], held: ["held"], returned: ["returned"] };

function board(now: number): BoardView {
  const leads = all(now);
  const day = now - 24 * 60 * MIN;
  const signed = leads.filter((l) => l.signedAt && l.signedAt > day);
  const ms = signed.map((l) => l.signedAt! - l.created).sort((a, b) => a - b);
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const hour0 = Math.floor(now / (60 * MIN)) * 60 * MIN - 23 * 60 * MIN;
  const perHour = Array.from({ length: 24 }, (_, h) => {
    const from = hour0 + h * 60 * MIN, to = from + 60 * MIN;
    return {
      hour: iso(from),
      signed: leads.filter((l) => l.signedAt && l.signedAt >= from && l.signedAt < to).length,
      held: leads.filter((l) => (l.state === "held" || l.state === "returned") && l.updated >= from && l.updated < to).length,
    };
  });
  const held = leads.filter((l) => l.state === "held");
  const byReason = new Map<string, { count: number; latest: number }>();
  for (const l of held) {
    const r = readableOf(l.reason!);
    const b = byReason.get(r) ?? { count: 0, latest: 0 };
    byReason.set(r, { count: b.count + 1, latest: Math.max(b.latest, l.updated) });
  }
  const waiting = leads.filter((l) => l.state === "waiting" || l.state === "in_transit").sort((a, b) => a.created - b.created)[0];
  const n = (s: ShipmentState[]) => leads.filter((l) => s.includes(l.state)).length;
  return {
    moving: n(["picked_up", "in_transit"]), waiting: n(["waiting"]), held: n(["held"]), returned: n(["returned"]),
    signed24h: signed.length, signedToday: signed.filter((l) => l.signedAt! >= startOfDay.getTime()).length,
    heldOrReturned24h: leads.filter((l) => (l.state === "held" || l.state === "returned") && l.updated > day).length,
    oldestWaiting: waiting ? { shipmentId: waiting.id, waybill: waiting.waybill, since: iso(waiting.created), tries: waiting.tries, nextAt: waiting.nextAt ? iso(waiting.nextAt) : null } : null,
    firstTryShare: signed.length ? signed.filter((l) => l.tries === 1).length / signed.length : null,
    medianSignMs: ms.length ? ms[Math.floor(ms.length / 2)]! : null,
    perHour,
    holdReasons: [...byReason.entries()].sort((a, b) => b[1].count - a[1].count).map(([reason, v]) => ({ reason, count: v.count, latest: iso(v.latest) })),
    recent: [...leads].sort((a, b) => b.updated - a.updated).slice(0, 8)
      .map((l) => ({ shipmentId: l.id, waybill: l.waybill, who: who(l), route: l.route.label, state: l.state, at: iso(l.updated), tries: l.tries })),
  };
}

function log(now: number, f: { q?: string; state?: LogState; page?: number }) {
  const leads = all(now);
  const q = f.q?.trim().toLowerCase() ?? "";
  const wb = q ? parseWaybill(q) : null;
  const rows = leads.filter((l) => (!f.state || statesOf[f.state].includes(l.state))
    && (!q || (wb ? l.seq === wb.seq && wb.year === 26 : [l.first, l.last, l.email, l.company, l.phone].some((x) => x.toLowerCase().includes(q)))));
  const pages = Math.max(1, Math.ceil(rows.length / 15));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const counts = Object.fromEntries((Object.keys(statesOf) as LogState[]).map((k) => [k, leads.filter((l) => statesOf[k].includes(l.state)).length])) as Record<LogState, number>;
  return {
    total: rows.length, page, pages, counts,
    rows: rows.slice((page - 1) * 15, page * 15).map((l): LogRow => ({
      shipmentId: l.id, waybill: l.waybill, who: who(l), email: l.email, company: l.company, route: l.route.label, source: l.source, state: l.state,
      tries: l.tries, at: iso(l.created), updatedAt: iso(l.updated), reason: l.reason ? readableOf(l.reason) : null,
      lastStatus: l.state === "held" ? 422 : l.state === "signed" ? 201 : l.state === "waiting" ? 429 : null,
      score: demoScore(l, now)?.score ?? null,
    })),
  };
}

function leadView(now: number, id: number): LeadView | null {
  const i = 900_000 + TOP - id;
  if (!Number.isInteger(i) || i < 0 || i >= N) return null;
  const l = lead(i, now);
  const contact = { firstName: l.first, lastName: l.last, email: l.email, phone: l.phone, companyName: l.company,
    ...(l.route.key === "contact" ? { message: "Hello, do you treat running injuries? My knee has been sore since the half marathon." } : {}) };
  const cid = `c${(l.seq * 7919).toString(36)}Qx`, oid = `o${(l.seq * 104729).toString(36)}Rv`;
  const contactSent = { locationId: LOCATION, firstName: l.first, lastName: l.last, email: l.email, phone: l.phone, companyName: l.company, tags: l.route.tags, source: "Fernway" };
  const oppSent = { locationId: LOCATION, contactId: cid, pipelineId: l.route.pipelineId, pipelineStageId: l.route.stageId, name: `${who(l)} · ${l.route.label}`, status: "open" };
  let k = 0;
  const scan = (kind: string, at: number, o: Partial<LeadView["scans"][number]> = {}) => ({ id: ++k, kind, step: null, at: iso(at), try: null, status: null, ms: null, sent: null, answer: null, note: null, ...o });
  const scans: LeadView["scans"] = [scan("picked_up", l.created, { note: `from ${l.source}` }), scan("checked", l.created + 20, { note: "valid: email, phone, company" })];
  let t = l.created + 400;
  if (l.tries === 2 && l.state === "signed") {
    scans.push(scan("retry_scheduled", t, { step: "contact", try: 1, status: 503, ms: 2140, sent: contactSent, answer: '{"message":"Service Unavailable"}', note: "GHL error (503)" }));
    t += 31_000;
  }
  if (l.state !== "in_transit") {
    scans.push(scan("handed", t, { step: "contact", try: l.tries === 2 ? 2 : 1, status: 201, ms: 380 + (l.i % 300), sent: contactSent, answer: `{"new":true,"contact":{"id":"${cid}"}}`, note: `contact ${cid}` }));
  }
  if (contact.message && l.state === "signed") {
    scans.push(scan("handed", t + 300, { step: "note", try: 1, status: 201, ms: 290, sent: { body: contact.message }, answer: '{"note":{"id":"n_x"}}', note: "message added as a note" }));
  }
  if (l.state === "signed") {
    scans.push(l.route.stageId
      ? scan("signed", l.signedAt!, { step: "opportunity", try: l.tries, status: 201, ms: 420 + (l.i % 400), sent: oppSent, answer: `{"new":true,"opportunity":{"id":"${oid}"}}`, note: `${l.route.label}: stage set` })
      : scan("signed", l.signedAt!, { try: l.tries, note: "contact in GHL; this route sets no stage" }));
    // Later, in GHL: sales moved some deals on, and GHL told Fernway.
    const moved = l.signedAt! + (3 * 60 + (l.i % 50)) * MIN;
    if (l.route.stageId && l.i % 9 === 0 && moved < now) {
      scans.push(scan("ghl_moved", moved, { note: "moved to stage stage_plan" }));
      if (l.i % 18 === 0 && moved + 26 * 60 * MIN < now) scans.push(scan("ghl_moved", moved + 26 * 60 * MIN, { note: "marked won" }));
    }
  } else if (l.state === "held") {
    scans.push(scan("held", l.updated, { step: "opportunity", try: 1, status: 422, ms: 340, sent: oppSent, answer: l.reason, note: readableOf(l.reason!) }));
  } else if (l.state === "waiting") {
    scans.push(scan("retry_scheduled", l.updated, { step: "opportunity", try: 3, status: 429, ms: 120, sent: oppSent, answer: '{"message":"Too many requests"}', note: "GHL busy (429)" }));
  } else if (l.state === "returned") {
    scans.push(scan("returned", l.updated, { try: 8, note: "no answer from GHL after 8 tries over 24 hours" }));
  }
  return {
    shipmentId: l.id, waybill: l.waybill, state: l.state, source: l.source, route: { key: l.route.key, label: l.route.label }, contact,
    idempotencyKey: `demo-${l.seq}`, tries: l.tries, createdAt: iso(l.created), nextTryAt: l.nextAt ? iso(l.nextAt) : null,
    reason: l.reason ? readableOf(l.reason) : null, meeting: null,
    ghl: { contactId: l.state === "in_transit" ? null : cid, opportunityId: l.state === "signed" && l.route.stageId ? oid : null, noteId: null, appointmentId: null },
    scans,
  };
}

function routesView(now: number): RouteRow[] {
  const leads = all(now), since = now - 30 * 1440 * MIN;
  return routes.map((r) => {
    const mine = leads.filter((l) => l.route.id === r.id);
    const recent = mine.filter((l) => l.created > since);
    return {
      id: r.id, key: r.key, label: r.label, tags: r.tags, pipelineId: r.pipelineId, stageId: r.stageId, calendarId: r.calendarId,
      leads30: recent.length, signed30: recent.filter((l) => l.state === "signed").length, held30: recent.filter((l) => l.state === "held" || l.state === "returned").length,
      lastLeadAt: iso(Math.max(...mine.map((l) => l.created))), createdAt: iso(now - 41 * 1440 * MIN),
    };
  });
}

const auditLines = (now: number) => {
  const at = (min: number) => iso(now - min * MIN);
  const l = (n: number) => lead(n, now).waybill;
  return [
    { who: "Sara Okafor", action: "lead.resent", targetKind: "lead", targetId: l(23), detail: "The phone number is not valid for the country of the location", at: at(50) },
    { who: "Jonas Berg", action: "lead.resent", targetKind: "lead", targetId: l(46), detail: "returned after 8 tries", at: at(180) },
    { who: "Sara Okafor", action: "leads.resent", targetKind: null, targetId: null, detail: "4 held for: Email is invalid", at: at(1200) },
    { who: "Maya Lindqvist", action: "member.invited", targetKind: "invite", targetId: "oskar.lund@harborphysio.com", detail: "as member", at: at(1440) },
    { who: "Sara Okafor", action: "member.joined", targetKind: "member", targetId: "3", detail: "as member", at: at(4 * 1440) },
    { who: "Jonas Berg", action: "member.invited", targetKind: "invite", targetId: "sara.okafor@harborphysio.com", detail: "as member", at: at(5 * 1440) },
    { who: "Jonas Berg", action: "sheet.linked", targetKind: "sheet", targetId: "Harbor Physio leads 2026", detail: "new leads are written to the tab Fernway leads", at: at(6 * 1440) },
    { who: "Maya Lindqvist", action: "score.on", targetKind: "score", targetId: "Claude score", detail: "new leads are read by Claude", at: at(14 * 1440) },
    { who: "Jonas Berg", action: "form.made", targetKind: "form", targetId: "Corporate wellness funnel", detail: "contact · 4 fields · any site", at: at(9 * 1440 - 50) },
    { who: "Jonas Berg", action: "key.revoked", targetKind: "key", targetId: "fw_p3x8d1wz_", detail: "", at: at(8 * 1440) },
    { who: "Jonas Berg", action: "route.changed", targetKind: "route", targetId: "booking", detail: "tags booking, website", at: at(9 * 1440) },
    { who: "Jonas Berg", action: "route.made", targetKind: "route", targetId: "assessment", detail: "Free assessment; tags assessment; stage New assessment; calendar Free assessment", at: at(12 * 1440) },
    { who: "Jonas Berg", action: "member.joined", targetKind: "member", targetId: "2", detail: "as admin", at: at(19 * 1440) },
    { who: "Maya Lindqvist", action: "member.invited", targetKind: "invite", targetId: "jonas.berg@harborphysio.com", detail: "as admin", at: at(20 * 1440) },
    { who: "Maya Lindqvist", action: "key.made", targetKind: "key", targetId: "fw_k7m2q9xa_", detail: "Harbor Physio website", at: at(40 * 1440) },
    { who: "Maya Lindqvist", action: "route.made", targetKind: "route", targetId: "contact", detail: "Contact form; tags contact; no stage", at: at(41 * 1440 - 35) },
    { who: "Maya Lindqvist", action: "route.made", targetKind: "route", targetId: "booking", detail: "Booking requests; tags booking; stage New booking", at: at(41 * 1440 - 20) },
    { who: "Maya Lindqvist", action: "ghl.connected", targetKind: "ghl", targetId: LOCATION, detail: "12 permissions", at: at(41 * 1440) },
    { who: "Maya Lindqvist", action: "plan.changed", targetKind: "plan", targetId: "growth", detail: "Growth, $49 a month", at: at(41 * 1440 + 30) },
  ];
};
const groups: Record<AuditGroup, string[]> = { leads: ["lead.", "leads."], routes: ["route."], ghl: ["ghl."], team: ["member.", "invite."], keys: ["key."], plan: ["plan."], forms: ["form."], score: ["score."], sheet: ["sheet."] };

export function demoConsoleWho(): ConsoleWho {
  const now = Date.now();
  const data: ConsoleData = {
    board: async () => board(now),
    log: async (f) => log(now, f),
    lead: async (id) => leadView(now, id),
    receipt: () => null,
    routes: async () => routesView(now),
    score: async () => scoreView(now),
    sheet: async () => sheetView(now),
    scoreOf: async (id) => {
      const i = 900_000 + TOP - id;
      return Number.isInteger(i) && i >= 0 && i < N ? demoScore(lead(i, now), now) : null;
    },
    forms: async () => [
      { id: 1, key: "fwf_hq3m7xk2pd5vbn4tr8ca", label: "Harbor Physio website", routeKey: "booking", routeLabel: "Booking requests",
        fields: ["firstName", "lastName", "email", "phone", "message"], theme: "light", button: "Request a booking", sites: ["harborphysio.com", "*.harborphysio.com"],
        madeBy: "Maya Lindqvist", createdAt: iso(now - 40 * 1440 * MIN), leads30: 412, lastLeadAt: iso(now - 7 * MIN) },
      { id: 2, key: "fwf_w2nz6cj4ru7lfa3kte5y", label: "Corporate wellness funnel", routeKey: "contact", routeLabel: "Contact form",
        fields: ["firstName", "email", "companyName", "message"], theme: "dark", button: "Talk to us", sites: [],
        madeBy: "Jonas Berg", createdAt: iso(now - 9 * 1440 * MIN), leads30: 38, lastLeadAt: iso(now - 3 * 60 * MIN) },
    ],
    choices: async () => ({
      pipelines: [
        { id: "pipe_patients", name: "Patients", stages: [{ id: "stage_new", name: "New booking" }, { id: "stage_assessed", name: "New assessment" }, { id: "stage_plan", name: "Treatment plan" }] },
        { id: "pipe_corporate", name: "Corporate wellness", stages: [{ id: "stage_enquiry", name: "Enquiry" }, { id: "stage_proposal", name: "Proposal sent" }] },
      ],
      calendars: [{ id: "cal_assessment", name: "Free assessment", minutes: 45 }, { id: "cal_followup", name: "Follow-up", minutes: 30 }],
    }),
    connection: async () => {
      const leads = all(now).filter((l) => l.updated > now - 24 * 60 * MIN);
      const ok = leads.filter((l) => l.state === "signed").length * 2;
      return {
        connected: true, status: "connected", locationId: LOCATION,
        scopes: ["contacts.write", "contacts.readonly", "opportunities.readonly", "opportunities.write", "calendars.readonly", "calendars/events.readonly",
          "calendars/events.write", "locations/customFields.readonly", "locations.readonly", "workflows.readonly", "oauth.readonly", "oauth.write"],
        connectedAt: iso(now - 41 * 1440 * MIN), refreshedAt: iso(now - 4 * 60 * MIN), expiresAt: iso(now + 20 * 60 * MIN), lastError: null,
        calls: { ok, refused: leads.filter((l) => l.state === "held").length, failed: leads.filter((l) => l.tries === 2).length, none: 0, medianMs: 412, lastAt: iso(all(now)[0]!.updated) },
      };
    },
    ghlEvents: async () => [
      { id: 6, type: "OpportunityStageUpdate", leads: 1, summary: "A deal moved to another stage", at: iso(now - 12 * MIN) },
      { id: 5, type: "AppointmentUpdate", leads: 1, summary: "A meeting confirmed", at: iso(now - 95 * MIN) },
      { id: 4, type: "OpportunityStatusUpdate", leads: 1, summary: "A deal marked won", at: iso(now - 4 * 60 * MIN) },
      { id: 3, type: "OpportunityStageUpdate", leads: 1, summary: "A deal moved to another stage", at: iso(now - 6 * 60 * MIN) },
      { id: 2, type: "ContactDelete", leads: 0, summary: "A contact deleted", at: iso(now - 26 * 60 * MIN) },
      { id: 1, type: "AppointmentUpdate", leads: 1, summary: "A meeting cancelled", at: iso(now - 30 * 60 * MIN) },
    ],
    team: async () => ({
      members: [
        { userId: 1, name: "Maya Lindqvist", email: "maya.lindqvist@harborphysio.com", role: "owner", joinedAt: iso(now - 42 * 1440 * MIN), lastSeenAt: iso(now - 2 * MIN), twoStep: true },
        { userId: 2, name: "Jonas Berg", email: "jonas.berg@harborphysio.com", role: "admin", joinedAt: iso(now - 19 * 1440 * MIN), lastSeenAt: iso(now - 42 * MIN), twoStep: true },
        { userId: 3, name: "Sara Okafor", email: "sara.okafor@harborphysio.com", role: "member", joinedAt: iso(now - 4 * 1440 * MIN), lastSeenAt: iso(now - 27 * 60 * MIN), twoStep: false },
      ],
      invites: [{ id: 1, email: "oskar.lund@harborphysio.com", role: "member", by: "Maya Lindqvist", sentAt: iso(now - 1440 * MIN), expiresAt: iso(now + 6 * 1440 * MIN) }],
    }),
    audit: async (page, group) => {
      const rows = auditLines(now).filter((r) => !group || groups[group].some((p) => r.action.startsWith(p)));
      const p = Math.min(Math.max(1, page), Math.max(1, Math.ceil(rows.length / 15)));
      return {
        total: rows.length, page: p, pages: Math.max(1, Math.ceil(rows.length / 15)),
        rows: rows.slice((p - 1) * 15, p * 15).map((r, i) => ({
          id: 1000 - i - (p - 1) * 15, accountId: 39, userId: 1, who: r.who, action: r.action as AuditAction, targetKind: r.targetKind as AuditTarget | null,
          targetId: r.targetId, detail: r.detail, at: r.at,
        })),
      };
    },
    waybillId: async (wb) => {
      const w = parseWaybill(wb);
      return w && w.year === 26 && w.seq <= TOP && w.seq > TOP - N ? 900_000 + w.seq : null;
    },
  };
  return {
    userId: 1, name: "Maya Lindqvist", accountId: 39, accountName: "Harbor Physio", role: "owner",
    base: "/demo/console", demo: true, when: demoWhen, data,
  };
}
