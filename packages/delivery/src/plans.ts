// What each account may use, from its plan (2026-11-10 03:30, the rates on /pricing). One place decides it; every
// gate asks here. Nothing is ever deleted by a plan: a feature the plan doesn't cover is refused when someone sets it up,
// and paused (never removed) if it was set up before, so moving up brings it back as it was.
//
// Starter: forms, the embed, WordPress, 2 people. Growth: adds bookings, 5 people. Scale: adds the API (and the Laravel
// package), webhooks out and Google Sheets, no team limit. Over a plan's leads, leads are still delivered; the owner is
// asked to move up for the next month.
import { eq } from "drizzle-orm";
import { billingView, PLANS } from "./billing.js";
import type { Db } from "./db.js";
import { accounts, type BillingStatus, type PlanKey } from "./schema.js";

export type Feature = "bookings" | "api" | "webhooks" | "sheets";

const BY_PLAN: Record<PlanKey, { features: Feature[]; team: number | null }> = {
  starter: { features: [], team: 2 },
  growth: { features: ["bookings"], team: 5 },
  scale: { features: ["bookings", "api", "webhooks", "sheets"], team: null },
};
const EVERYTHING: Feature[] = ["bookings", "api", "webhooks", "sheets"];

/** The smallest plan with a feature: what a refusal tells the owner to move up to. */
export const NEEDS: Record<Feature, PlanKey> = { bookings: "growth", api: "scale", webhooks: "scale", sheets: "scale" };

const WORDS: Record<Feature, string> = {
  bookings: "Bookings",
  api: "The API",
  webhooks: "Webhooks out",
  sheets: "Google Sheets",
};

export type Entitlement = {
  /** house: made by Fernway's operator; plan: a paid plan; trial: the 14 days; ended: a trial over with no plan picked. */
  kind: "house" | "plan" | "trial" | "ended";
  plan: PlanKey | null;
  features: ReadonlySet<Feature>;
  /** People on the account, invites included; null is no limit. */
  team: number | null;
  /** Leads signed for a month the plan covers; null when nothing is counted (house, trial). */
  leads: number | null;
};

/** Billing states in which the plan is still the plan: paid, Stripe's own trial, or a payment being retried. */
const LIVE: BillingStatus[] = ["active", "trialing", "past_due"];

export function entitlementOf(
  a: { plan: PlanKey | null; billingStatus: BillingStatus | null; trialEndsAt: Date | null },
  now: Date = new Date(),
): Entitlement {
  // Every sign-up gets a trial date; an account with neither a trial nor a plan was made by Fernway's operator (the public
  // site's, the demo's, one set up by hand), and carries everything.
  if (!a.plan && !a.trialEndsAt) return { kind: "house", plan: null, features: new Set(EVERYTHING), team: null, leads: null };
  if (a.plan && a.billingStatus && LIVE.includes(a.billingStatus)) {
    const p = BY_PLAN[a.plan];
    return { kind: "plan", plan: a.plan, features: new Set(p.features), team: p.team, leads: PLANS[a.plan].leads };
  }
  // A trial tries everything, so a team can see the whole of Fernway before it picks.
  if (a.trialEndsAt && a.trialEndsAt > now) return { kind: "trial", plan: null, features: new Set(EVERYTHING), team: null, leads: null };
  // Over, with no plan: the forms, the embed and WordPress keep delivering (no lead is lost), at Starter's size.
  return { kind: "ended", plan: null, features: new Set(BY_PLAN.starter.features), team: BY_PLAN.starter.team, leads: null };
}

export async function entitlementFor(db: Db, accountId: number): Promise<Entitlement> {
  const [a] = await db.select({ plan: accounts.plan, billingStatus: accounts.billingStatus, trialEndsAt: accounts.trialEndsAt })
    .from(accounts).where(eq(accounts.id, accountId));
  if (!a) throw new Error(`no account ${accountId}`);
  return entitlementOf(a);
}

/** The refusal, said the same way everywhere: what is missing, which plan has it, and what to do. */
export function notOnPlan(f: Feature, e: Entitlement): string {
  const where = e.kind === "ended" ? "Your trial has ended" : e.plan ? `${PLANS[e.plan].name} doesn't include it` : "Not on this plan";
  return `${WORDS[f]} ${f === "bookings" || f === "webhooks" ? "are" : "is"} on the ${PLANS[NEEDS[f]].name} plan. ${where}: pick a plan in Plan and billing.`;
}

/** The accounts among these whose plan lacks a feature, for the worker's loops (each account read once a run). */
export async function lacking(db: Db, accountIds: number[], f: Feature): Promise<number[]> {
  const out: number[] = [];
  for (const id of new Set(accountIds)) {
    try {
      if (!(await entitlementFor(db, id)).features.has(f)) out.push(id);
    } catch {
      out.push(id);
    }
  }
  return out;
}

/** What the owner should hear about the plan, if anything: a trial over with no plan, or a month past the plan's leads. */
export type PlanNote = { kind: "ended" } | { kind: "over"; plan: PlanKey; used: number; leads: number; until: string | null };

export async function planNote(db: Db, accountId: number): Promise<PlanNote | null> {
  const e = await entitlementFor(db, accountId);
  if (e.kind === "ended") return { kind: "ended" };
  if (e.kind !== "plan" || !e.plan || e.leads === null) return null;
  const b = await billingView(db, accountId);
  if (!b || b.used <= e.leads) return null;
  // Over the plan: every lead is still delivered; the next month should be on a plan that covers it.
  return { kind: "over", plan: e.plan, used: b.used, leads: e.leads, until: b.periodEnd };
}
