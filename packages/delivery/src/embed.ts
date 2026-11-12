// Embed forms: a Fernway form for any website or GHL funnel, put in with one line of code. Each has a public key (it sits
// in the page's code, so it is no secret: what it can do is send a lead to one route of one account, within limits),
// the fields its owner chose, a light, dark or automatic look, and the sites allowed to show it. Owners and admins make,
// change and revoke them; every change is audited.
import { randomBytes } from "node:crypto";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./console.js";
import type { Db } from "./db.js";
import { ingestLead, type Deps, type IngestResult } from "./engine.js";
import type { Manager } from "./manage.js";
import { embedFields, embedForms, embedThemes, routes, type EmbedField, type EmbedTheme } from "./schema.js";

export const MAX_FORMS = 20;
type Problems = { ok: false; problems: string[] };
const notAllowed: Problems = { ok: false, problems: ["form: only the account's owner or an admin can change this"] };

/** A public form key: fwf_ and 20 base32 letters (100 bits). */
export function newFormKey(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz234567";
  return `fwf_${[...randomBytes(20)].map((b) => abc[b & 31]).join("")}`;
}

/** A site as kept: its host only, lower-case, "*." allowed in front for every subdomain. Null when it isn't one. */
export function siteHost(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  const wild = s.startsWith("*.");
  if (wild) s = s.slice(2);
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s) && s !== "localhost") return null;
  return wild ? `*.${s}` : s;
}

/** Whether a page at `host` may show a form allowed on `sites` (none listed: any site). */
export function siteAllowed(sites: string[], host: string | null): boolean {
  if (!sites.length) return true;
  if (!host) return false;
  const h = host.toLowerCase();
  return sites.some((s) => (s.startsWith("*.") ? h === s.slice(2) || h.endsWith(s.slice(1)) : h === s));
}

/** The page addresses a browser may frame the form from, for the form page's Content-Security-Policy. */
export function frameAncestors(sites: string[]): string {
  return sites.length ? sites.map((s) => `https://${s}`).join(" ") : "https:";
}

export const formInput = z.object({
  label: z.string().trim().min(1, "a name for the form").max(80),
  routeKey: z.string().trim().min(1, "the route its leads take").max(40),
  fields: z.array(z.enum(embedFields)).min(1).max(6).refine((f) => f.includes("email"), "the email field (GHL matches contacts by it)"),
  theme: z.enum(embedThemes).default("light"),
  button: z.string().trim().min(1, "the button's words").max(30).default("Send"),
  sites: z.array(z.string()).max(10, "10 sites at most").default([]),
}).strict();

export type FormRow = {
  id: number; key: string; label: string; routeKey: string; routeLabel: string | null; fields: EmbedField[]; theme: EmbedTheme;
  button: string; sites: string[]; madeBy: string; createdAt: string; leads30: number; lastLeadAt: string | null;
};

/** The account's live forms, oldest first, with what each sent in the last 30 days. */
export async function formsView(db: Db, accountId: number): Promise<FormRow[]> {
  const rows = await db.execute<{
    id: string; key: string; label: string; route_key: string; route_label: string | null; fields: EmbedField[]; theme: EmbedTheme;
    button: string; sites: string[]; made_by: string; created_at: Date; leads: string; last: Date | null;
  }>(sql`
    select f.id, f.key, f.label, f.route_key, r.label route_label, f.fields, f.theme, f.button, f.sites, f.made_by, f.created_at,
      (select count(*) from shipments s where s.account_id = f.account_id and s.idempotency_key like 'embed-' || f.id || '-%'
        and s.created_at > now() - interval '30 days') leads,
      (select max(s.created_at) from shipments s where s.account_id = f.account_id and s.idempotency_key like 'embed-' || f.id || '-%') last
    from embed_forms f left join routes r on r.account_id = f.account_id and r.key = f.route_key
    where f.account_id = ${accountId} and f.revoked_at is null
    order by f.created_at, f.id`);
  return rows.rows.map((r) => ({
    id: Number(r.id), key: r.key, label: r.label, routeKey: r.route_key, routeLabel: r.route_label, fields: r.fields, theme: r.theme,
    button: r.button, sites: r.sites ?? [], madeBy: r.made_by, createdAt: new Date(r.created_at).toISOString(),
    leads30: Number(r.leads), lastLeadAt: r.last ? new Date(r.last).toISOString() : null,
  }));
}

/** Makes a form (no id) or changes one. Its key never changes: pages already carry it. */
export async function saveForm(db: Db, m: Manager, input: unknown, id?: number): Promise<{ ok: true; id: number; key: string } | Problems> {
  if (m.role !== "owner" && m.role !== "admin") return notAllowed;
  const p = formInput.safeParse(input);
  if (!p.success) return { ok: false, problems: p.error.issues.map((i) => `${String(i.path[0] ?? "form")}: ${i.message}`) };
  const v = p.data;
  const sites: string[] = [];
  for (const raw of v.sites.filter((s) => s.trim())) {
    const h = siteHost(raw);
    if (!h) return { ok: false, problems: [`sites: ${raw.trim().slice(0, 60)} is not a site's address`] };
    if (!sites.includes(h)) sites.push(h);
  }
  const [route] = await db.select({ id: routes.id }).from(routes).where(and(eq(routes.accountId, m.accountId), eq(routes.key, v.routeKey)));
  if (!route) return { ok: false, problems: ["routeKey: a route of this account"] };
  // The fields in the form's own order, whatever order they were picked in.
  const fields = embedFields.filter((f) => v.fields.includes(f));
  const values = { label: v.label, routeKey: v.routeKey, fields, theme: v.theme, button: v.button, sites };
  const said = `${v.routeKey} · ${fields.length} fields · ${sites.length ? sites.join(", ") : "any site"}`;

  if (id === undefined) {
    const [n] = await db.select({ n: count() }).from(embedForms).where(and(eq(embedForms.accountId, m.accountId), isNull(embedForms.revokedAt)));
    if ((n?.n ?? 0) >= MAX_FORMS) return { ok: false, problems: [`form: an account has ${MAX_FORMS} forms at most`] };
    const key = newFormKey();
    const [made] = await db.insert(embedForms).values({ accountId: m.accountId, key, madeBy: m.name.slice(0, 80), ...values }).returning({ id: embedForms.id });
    await audit(db, m, "form.made", { kind: "form", id: v.label.slice(0, 80) }, said);
    return { ok: true, id: made!.id, key };
  }
  const [was] = await db.update(embedForms).set(values)
    .where(and(eq(embedForms.id, id), eq(embedForms.accountId, m.accountId), isNull(embedForms.revokedAt))).returning({ key: embedForms.key });
  if (!was) return { ok: false, problems: ["form: that form is not in this account"] };
  await audit(db, m, "form.changed", { kind: "form", id: v.label.slice(0, 80) }, said);
  return { ok: true, id, key: was.key };
}

/** Revokes a form: every page carrying it shows that it is closed, and nothing more is taken from it. */
export async function revokeForm(db: Db, m: Manager, id: number): Promise<boolean> {
  if (m.role !== "owner" && m.role !== "admin") return false;
  const [f] = await db.update(embedForms).set({ revokedAt: new Date() })
    .where(and(eq(embedForms.id, id), eq(embedForms.accountId, m.accountId), isNull(embedForms.revokedAt))).returning({ label: embedForms.label });
  if (!f) return false;
  await audit(db, m, "form.revoked", { kind: "form", id: f.label.slice(0, 80) }, "pages carrying it now show it closed");
  return true;
}

export type PublicForm = { id: number; accountId: number; label: string; routeKey: string; fields: EmbedField[]; theme: EmbedTheme; button: string; sites: string[] };

/** A live form by its public key, for the page that shows it and the address that takes its leads. */
export async function formByKey(db: Db, key: string): Promise<PublicForm | null> {
  if (!/^fwf_[a-z2-7]{20}$/.test(key)) return null;
  const [f] = await db.select().from(embedForms).where(and(eq(embedForms.key, key), isNull(embedForms.revokedAt)));
  return f ? { id: f.id, accountId: f.accountId, label: f.label, routeKey: f.routeKey, fields: f.fields, theme: f.theme, button: f.button, sites: f.sites } : null;
}

/**
 * A lead from an embed form: only the form's own fields are taken, on its route, as source "embed". The page makes one
 * key when it opens, so a double press or a resend of the same form is one lead.
 */
export async function embedLead(deps: Deps, form: PublicForm, opened: string, contact: Record<string, string>): Promise<IngestResult> {
  const filled = Object.fromEntries(form.fields.map((f) => [f, (contact[f] ?? "").trim()]).filter(([, v]) => v !== ""));
  return ingestLead(deps, form.accountId, { idempotencyKey: `embed-${form.id}-${opened}`, source: "embed", route: form.routeKey, contact: filled });
}
