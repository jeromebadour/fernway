import "server-only";
// The operator console's public demo: an invented Fernway running 24 accounts, read the same way as the real one.
// Every name, number and id here is made up; times are set back from now, so the demo always reads as live.
import type { AccountDetail, AccountRow, BoxReading, IncidentRow, StaffRow, Watch } from "@fernway/delivery";
import type { emailView, ghlView, overviewView, queueView, stripeView } from "@fernway/delivery";
import type { When } from "@/ui/when";

const now = () => Date.now();
const ago = (min: number) => new Date(now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(now() + min * 60_000).toISOString();
const daysAgo = (d: number) => ago(d * 1440);

export const demoWhen: When = { dateStyle: "day-month", clock: "24h", timeZone: "Europe/London" };
export const demoStaff = { userId: 1, name: "Nora Whitlock", role: "owner" as const };

// [id, name, owner, email, plan, billing, people, leads30, held, ghl, created days ago]
type Seed = [number, string, string, string, "starter" | "growth" | "scale" | null, string | null, number, number, number, "connected" | "needs_reconnect" | null, number];
const seeds: Seed[] = [
  [41, "Northpine Dental", "Lena Hartmann", "lena@northpine.dental", "growth", "active", 4, 1862, 2, "connected", 96],
  [40, "Cedar Lane Vets", "Tom Whitfield", "tom@cedarlanevets.com", "scale", "active", 9, 6410, 0, "connected", 91],
  [39, "Harbor Physio", "Maya Lindqvist", "maya@harborphysio.com", "growth", "active", 3, 2276, 6, "connected", 88],
  [38, "Fjordline Rowing", "Ingrid Moss", "ingrid@fjordline.club", "starter", "active", 2, 311, 0, "connected", 80],
  [37, "Lumen Studio", "Priya Nair", "priya@lumen.studio", "growth", "past_due", 5, 1240, 1, "connected", 77],
  [36, "Bellini & Co", "Marco Bellini", "marco@bellini.co", null, null, 1, 46, 0, "connected", 9],
  [35, "Porto Runners", "Lucas Ferreira", "lucas@portorunners.pt", "starter", "active", 2, 204, 0, "needs_reconnect", 70],
  [34, "Northgate Gym", "Hanna Kowalski", "hanna@northgategym.com", "growth", "active", 6, 3108, 3, "connected", 66],
  [33, "Clarke Dental", "Emma Clarke", "emma@clarkedental.com", "scale", "active", 12, 9420, 4, "connected", 61],
  [32, "Lund Carpentry", "Oskar Lund", "oskar@lundcarpentry.se", null, null, 1, 12, 0, null, 4],
  [31, "Okafor Legal", "James Okafor", "james@okaforlegal.com", "growth", "active", 4, 980, 0, "connected", 55],
  [30, "Becker Bakes", "Mia Becker", "mia@beckerbakes.de", "starter", "canceled", 1, 0, 0, "connected", 52],
  [29, "Jensen Bikes", "Noah Jensen", "noah@jensenbikes.dk", "starter", "active", 2, 377, 0, "connected", 48],
  [28, "Murphy Florals", "Ava Murphy", "ava@murphyflorals.ie", null, null, 2, 88, 1, "connected", 12],
  [27, "Novak Physio", "Leo Novak", "leo@novakphysio.cz", "growth", "active", 3, 1517, 0, "connected", 44],
];

export const demoAccounts: AccountRow[] = seeds.map(([id, name, owner, email, plan, billing, people, leads30, held, ghl, created]) => ({
  id, name, owner, ownerEmail: email, plan, billing, trialEndsAt: plan ? null : ahead((14 - created) * 1440), createdAt: daysAgo(created), people, leads30, held, ghl,
}));

export function demoBox(): BoxReading {
  return {
    at: new Date().toISOString(), load1: 0.82, cpus: 4, memUsed: 3.4e9, memTotal: 8e9, diskUsed: 61.2e9, diskTotal: 150e9, redisBytes: 9.8e6,
    webCommit: "c41e7a2", workerCommit: "c41e7a2", workerBeatAt: ago(0.1), jobs: { waiting: 3, active: 2, delayed: 11, failed: 0, completed: 1984 },
  };
}

export function demoWatches(): Watch[] {
  return [
    { key: "worker", label: "Worker", state: "ok", reading: "beat 6 s ago", limit: "a beat within 60 s" },
    { key: "disk", label: "Disk", state: "ok", reading: "41% used", limit: "under 80%" },
    { key: "memory", label: "Memory", state: "ok", reading: "43% used", limit: "under 90%" },
    { key: "queue", label: "Queue", state: "ok", reading: "nothing overdue", limit: "no try over 5 min late" },
    { key: "ghl_refusals", label: "GHL refusals", state: "ok", reading: "3% of 412 calls, last hour", limit: "under 20% of 10 or more" },
    { key: "ghl_tokens", label: "GHL tokens", state: "warn", reading: "1 account needs reconnecting", limit: "none refused" },
    { key: "backup", label: "Nightly backup", state: "ok", reading: "passed 9 h ago", limit: "passed within 26 h" },
    { key: "restore_test", label: "Restore test", state: "ok", reading: "passed 3 days ago", limit: "passed within 8 days" },
    { key: "email", label: "Alert emails", state: "ok", reading: "none given up, 24 h", limit: "none given up" },
    { key: "payments", label: "Payments", state: "warn", reading: "1 past due", limit: "none past due" },
  ];
}

export function demoOverview(): Awaited<ReturnType<typeof overviewView>> {
  return {
    accounts: 41, paying: 29, trial: 6, people: 118, leads24: 4318, signed24: 4290, held24: 11, dbBytes: 412e6, openIncidents: 2,
    runs: {
      deploy: { ok: true, at: ago(26 * 60), detail: "c41e7a2: web and worker healthy" },
      backup: { ok: true, at: ago(9 * 60), detail: "dump 38.6 MB, checked" },
      offsite: { ok: true, at: ago(9 * 60 - 1), detail: "encrypted copy uploaded, 38.7 MB" },
      restore_test: { ok: true, at: ago(3 * 1440), detail: "restored in 41 s, every table matching" },
    },
  };
}

export function demoIncidents(): IncidentRow[] {
  return [
    { id: 14, watcher: "ghl_tokens", level: "warn", openedAt: ago(52), closedAt: null, first: "1 account needs reconnecting", worst: "1 account needs reconnecting",
      ackBy: "Sam Ortega", ackAt: ago(40), note: "Porto Runners changed their GHL password; emailed Lucas to reconnect." },
    { id: 13, watcher: "payments", level: "warn", openedAt: ago(19 * 60), closedAt: null, first: "1 past due", worst: "1 past due", ackBy: null, ackAt: null, note: null },
    { id: 12, watcher: "ghl_refusals", level: "warn", openedAt: ago(3 * 1440 + 200), closedAt: ago(3 * 1440 + 155), first: "24% of 58 calls, last hour", worst: "31% of 64 calls, last hour",
      ackBy: "Nora Whitlock", ackAt: ago(3 * 1440 + 190), note: "Clarke Dental renamed a pipeline stage; their route held 20 leads. Fixed the route, resent all." },
    { id: 11, watcher: "queue", level: "down", openedAt: ago(6 * 1440 + 90), closedAt: ago(6 * 1440 + 52), first: "4 overdue, oldest 6 min", worst: "212 overdue, oldest 34 min",
      ackBy: "Nora Whitlock", ackAt: ago(6 * 1440 + 86), note: "GHL's API was down for their whole region (their status page). Tries waited as built; all 212 signed for within 9 min of GHL coming back." },
    { id: 10, watcher: "disk", level: "warn", openedAt: ago(12 * 1440), closedAt: ago(12 * 1440 - 30), first: "81% used", worst: "82% used",
      ackBy: "Sam Ortega", ackAt: ago(12 * 1440 - 5), note: "Old Docker images. Pruned; now 41%." },
    { id: 9, watcher: "backup", level: "down", openedAt: ago(20 * 1440), closedAt: ago(20 * 1440 - 70), first: "failed 6 min ago", worst: "failed 6 min ago",
      ackBy: "Nora Whitlock", ackAt: ago(20 * 1440 - 10), note: "R2 token expired. New token, backup run by hand, restore test passed." },
  ];
}

export function demoQueue(): Awaited<ReturnType<typeof queueView>> {
  const perHour = Array.from({ length: 24 }, (_, i) => {
    const h = new Date(now() - (23 - i) * 3_600_000); h.setMinutes(0, 0, 0);
    const local = (h.getUTCHours() + 24) % 24;
    const busy = local >= 7 && local <= 20 ? 1 : 0.25;
    const tries = Math.round((150 + ((i * 37) % 60)) * busy + 10);
    return { hour: h.toISOString(), tries, signed: Math.round(tries * 0.93) };
  });
  return {
    pickedUp: 1, inTransit: 2, waiting: 14, due: 3, overdue: 0, nextAt: ahead(0.6), oldestAt: ago(38),
    byAccount: [
      { id: 39, name: "Harbor Physio", moving: 1, waiting: 2, held: 6 },
      { id: 33, name: "Clarke Dental", moving: 1, waiting: 4, held: 4 },
      { id: 34, name: "Northgate Gym", moving: 0, waiting: 3, held: 3 },
      { id: 35, name: "Porto Runners", moving: 0, waiting: 5, held: 0 },
      { id: 41, name: "Northpine Dental", moving: 1, waiting: 0, held: 2 },
      { id: 37, name: "Lumen Studio", moving: 0, waiting: 0, held: 1 },
    ],
    perHour,
  };
}

export function demoGhl(): Awaited<ReturnType<typeof ghlView>> {
  return {
    calls: 9184, ok: 9031, refused: 64, failed: 61, none: 28, p50: 384, p95: 1210,
    byStep: [
      { step: "contact", calls: 4402, p50: 352, bad: 71 },
      { step: "opportunity", calls: 4111, p50: 418, bad: 58 },
      { step: "note", calls: 486, p50: 301, bad: 12 },
      { step: "appointment", calls: 185, p50: 512, bad: 12 },
    ],
    connections: demoAccounts.filter((a) => a.ghl).map((a, i) => ({
      accountId: a.id, name: a.name, location: locationOf(a.id),
      status: a.ghl!, expiresAt: ahead(20 * 60), refreshedAt: a.ghl === "connected" ? ago(30 + i * 17) : ago(3 * 1440),
      error: a.ghl === "needs_reconnect" ? "invalid_grant: refresh token is invalid or has been revoked" : null,
      calls: Math.round(a.leads30 / 12), bad: Math.round(a.held * 1.5),
    })),
    reasons: [
      { reason: "The phone number is not valid for the country of the location", n: 9, accounts: 3 },
      { reason: "Email is invalid", n: 5, accounts: 2 },
      { reason: "Pipeline stage not found", n: 2, accounts: 1 },
      { reason: "GHL is not connected for this account", n: 1, accounts: 1 },
    ],
  };
}

/** A made-up GHL sub-account id per account, 20 characters like GHL's own. */
export function locationOf(id: number): string {
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let x = id * 2654435761 % 4294967296, out = "";
  for (let i = 0; i < 20; i++) { x = (x * 1103515245 + 12345) % 2147483648; out += abc[x % abc.length]; }
  return out;
}

export function demoAccountDetail(id: number): AccountDetail | null {
  const a = demoAccounts.find((x) => x.id === id);
  if (!a) return null;
  const first = a.owner!.split(" ")[0]!.toLowerCase();
  const domain = a.ownerEmail!.split("@")[1]!;
  const team = [
    { userId: 100 + id, name: a.owner!, email: a.ownerEmail!, role: "owner", twoStep: true, confirmed: true, lastSeenAt: ago(25) },
    { userId: 200 + id, name: "Jonas Berg", email: `jonas@${domain}`, role: "admin", twoStep: true, confirmed: true, lastSeenAt: ago(180) },
    { userId: 300 + id, name: "Sara Okafor", email: `sara@${domain}`, role: "member", twoStep: false, confirmed: true, lastSeenAt: ago(1500) },
    { userId: 400 + id, name: "Oskar Lund", email: `oskar@${domain}`, role: "member", twoStep: false, confirmed: false, lastSeenAt: null },
  ].slice(0, Math.min(4, a.people));
  const price: Record<string, number> = { starter: 1900, growth: 4900, scale: 14900 };
  return {
    id: a.id, name: a.name, createdAt: a.createdAt, trialEndsAt: a.trialEndsAt, plan: a.plan as AccountDetail["plan"], billing: a.billing as AccountDetail["billing"],
    periodEnd: a.plan ? ahead(17 * 1440) : null, cancelAtPeriodEnd: false,
    stripeCustomer: a.plan ? `cus_${first}${id}Qd8xPz` : null, stripeSubscription: a.plan ? `sub_1Qd${id}${first}Tn4R` : null,
    people: team,
    leads: { total: a.leads30 * 3, d30: a.leads30, signed: a.leads30 * 3 - a.held - 3, held: a.held, returned: 1, moving: 2, lastAt: ago(4) },
    invoices: a.plan ? [0, 1, 2].map((k) => ({ id: `in_${id}${k}x`, number: `${first.toUpperCase().slice(0, 4)}${id}-000${3 - k}`, status: k === 0 && a.billing === "past_due" ? "open" : "paid",
      cents: price[a.plan!] ?? 0, currency: "usd", createdAt: daysAgo(13 + k * 30), plan: a.plan })) : [],
    events: [],
    ghl: a.ghl ? { location: locationOf(a.id), status: a.ghl, expiresAt: ahead(20 * 60), connectedAt: daysAgo(40), error: a.ghl === "needs_reconnect" ? "invalid_grant: refresh token is invalid or has been revoked" : null } : null,
    routes: 3,
    recent: [
      { who: "Sara Okafor", action: "lead.resent", target: "FW 26 16491", at: ago(50) },
      { who: "Jonas Berg", action: "route.changed", target: "booking", at: ago(9 * 1440) },
      { who: a.owner!, action: "member.invited", target: `oskar@${domain}`, at: ago(1440) },
      { who: a.owner!, action: "key.made", target: "fw_k7m2q9xa_", at: ago(40 * 1440) },
    ],
  };
}

export function demoStripe(page: number): Awaited<ReturnType<typeof stripeView>> {
  const types = ["invoice.paid", "customer.subscription.updated", "checkout.session.completed", "customer.subscription.created", "invoice.payment_failed"];
  const rows = Array.from({ length: 15 }, (_, i) => {
    const a = demoAccounts[(i * 7) % demoAccounts.length]!;
    const type = i === 3 ? "invoice.payment_failed" : types[i % 4]!;
    return { id: `evt_1Qd${(9_840_000 - i * 1337 - (page - 1) * 20_000).toString(36)}Xr${i}`, type, at: ago(i * 190 + 12 + (page - 1) * 3000), account: a.name, accountId: a.id };
  });
  return {
    total: 212, page, rows,
    plans: [
      { plan: "starter", billing: "active", n: 9 }, { plan: "growth", billing: "active", n: 15 }, { plan: "scale", billing: "active", n: 5 },
      { plan: "growth", billing: "past_due", n: 1 }, { plan: "starter", billing: "canceled", n: 2 }, { plan: null, billing: null, n: 9 },
    ],
    paid30Cents: 9 * 1900 + 15 * 4900 + 5 * 14900, openCents: 4900,
  };
}

export function demoEmail(): Awaited<ReturnType<typeof emailView>> {
  const r = (id: number, kind: string, email: string, account: string, min: number, sent: boolean, tries = 1, error: string | null = null) => ({
    id, kind, email, account, createdAt: ago(min), sentAt: sent ? ago(min - 1) : null, gaveUpAt: null, tries, error, nextAt: ahead(4),
  });
  return {
    sent7: 486, waiting: 1, gaveUp7: 0, held7: 61, returned7: 4, weekly7: 421, confirm7: 38, reset7: 7,
    recent: [
      r(9031, "held", "maya@harborphysio.com", "Harbor Physio", 51, true),
      r(9030, "held", "sara@harborphysio.com", "Harbor Physio", 51, false, 1, "Resend answered 429: too many requests"),
      r(9029, "held", "emma@clarkedental.com", "Clarke Dental", 140, true),
      r(9028, "returned", "lucas@portorunners.pt", "Porto Runners", 300, true, 2),
      r(9027, "held", "hanna@northgategym.com", "Northgate Gym", 610, true),
      r(9026, "weekly", "tom@cedarlanevets.com", "Cedar Lane Vets", 2 * 1440, true),
      r(9025, "weekly", "lena@northpine.dental", "Northpine Dental", 2 * 1440 + 3, true),
      r(9024, "weekly", "priya@lumen.studio", "Lumen Studio", 2 * 1440 + 5, true),
    ],
  };
}

export function demoStaffList(): StaffRow[] {
  return [
    { userId: 1, name: "Nora Whitlock", email: "nora@fernway.example", role: "owner", twoStep: true, addedAt: daysAgo(120), addedBy: null, lastSeenAt: ago(1) },
    { userId: 2, name: "Sam Ortega", email: "sam@fernway.example", role: "support", twoStep: true, addedAt: daysAgo(80), addedBy: "Nora Whitlock", lastSeenAt: ago(38) },
    { userId: 3, name: "Elise Varga", email: "elise@fernway.example", role: "viewer", twoStep: true, addedAt: daysAgo(30), addedBy: "Nora Whitlock", lastSeenAt: ago(2 * 1440) },
    { userId: 4, name: "Theo Brandt", email: "theo@fernway.example", role: "support", twoStep: false, addedAt: daysAgo(2), addedBy: "Nora Whitlock", lastSeenAt: null },
  ];
}

export function demoAudit() {
  const row = (id: number, who: string, action: string, min: number, target: string | null, detail: string, accountId: number | null = null) => ({
    id, who, action, account: accountId ? demoAccounts.find((a) => a.id === accountId)?.name ?? null : null, accountId, target, detail, at: ago(min),
  });
  return {
    total: 9, page: 1,
    rows: [
      row(9, "Sam Ortega", "incident.acknowledged", 40, "GHL tokens #14", "Porto Runners changed their GHL password; emailed Lucas to reconnect."),
      row(8, "Nora Whitlock", "staff.added", 2 * 1440, "Theo Brandt", "as support"),
      row(7, "Sam Ortega", "account.trial_extended", 3 * 1440, "Murphy Florals", "trial now ends in 9 days", 28),
      row(6, "Nora Whitlock", "incident.noted", 3 * 1440 + 150, "GHL refusals #12", "Fixed the route, resent all."),
      row(5, "Nora Whitlock", "account.synced", 5 * 1440, "Lumen Studio", "growth plan, past due, period to 2026-11-28", 37),
      row(4, "Nora Whitlock", "incident.acknowledged", 6 * 1440 + 86, "Queue #11", "GHL's API was down for their whole region."),
      row(3, "Sam Ortega", "incident.acknowledged", 12 * 1440 - 5, "Disk #10", "Old Docker images."),
      row(2, "Nora Whitlock", "staff.added", 30 * 1440, "Elise Varga", "as viewer"),
      row(1, "Nora Whitlock", "staff.added", 80 * 1440, "Sam Ortega", "as support"),
    ],
  };
}
