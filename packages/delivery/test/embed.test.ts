// Embed forms against a real database: made, changed and revoked by owners and admins only and audited; their sites
// kept as hosts; a lead from one takes only the form's own fields, on its route, once per opened form.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedLead, formByKey, formsView, frameAncestors, newFormKey, revokeForm, saveForm, siteAllowed, siteHost } from "../src/embed.js";
import { auditLog, embedForms, shipments } from "../src/schema.js";
import { createDb, fakeConnection, freshDatabase, seedAccount, testDeps } from "./support.js";

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: ReturnType<typeof createDb>;
let acc: number;
const owner = () => ({ accountId: acc, userId: null, name: "Lena Hartmann", role: "owner" as const });
const form = { label: "Clinic site", routeKey: "trial", fields: ["message", "email", "firstName"], theme: "auto", button: "Ask us", sites: ["https://Northpine.com/contact", "*.northpine.com", "northpine.com"] };

beforeAll(async () => {
  database = await freshDatabase("embed");
  app = createDb(database.appUrl, 2);
  acc = await seedAccount(app.db);
});
afterAll(async () => { await app.pool.end(); await database.drop(); });

describe("sites", () => {
  it("keeps a site as its host and checks a page against the list", () => {
    expect(siteHost("https://Northpine.com/contact?x=1")).toBe("northpine.com");
    expect(siteHost("*.northpine.com")).toBe("*.northpine.com");
    expect(siteHost("not a site")).toBeNull();
    expect(siteHost("javascript:alert(1)")).toBeNull();
    expect(siteAllowed([], null)).toBe(true);
    expect(siteAllowed(["northpine.com"], "northpine.com")).toBe(true);
    expect(siteAllowed(["northpine.com"], "evil-northpine.com")).toBe(false);
    expect(siteAllowed(["*.northpine.com"], "book.northpine.com")).toBe(true);
    expect(siteAllowed(["*.northpine.com"], "northpine.com")).toBe(true);
    expect(siteAllowed(["*.northpine.com"], "northpine.com.evil.io")).toBe(false);
    expect(frameAncestors([])).toBe("https:");
    expect(frameAncestors(["northpine.com", "*.northpine.com"])).toBe("https://northpine.com https://*.northpine.com");
    expect(newFormKey()).toMatch(/^fwf_[a-z2-7]{20}$/);
  });
});

describe("forms", () => {
  it("makes a form: fields in the form's order, sites as hosts once each, audited", async () => {
    const r = await saveForm(app.db, owner(), form);
    expect(r).toMatchObject({ ok: true });
    const [f] = await formsView(app.db, acc);
    expect(f).toMatchObject({ label: "Clinic site", routeKey: "trial", routeLabel: "Trial", fields: ["firstName", "email", "message"], theme: "auto", button: "Ask us", sites: ["northpine.com", "*.northpine.com"], madeBy: "Lena Hartmann" });
    const lines = await app.db.select().from(auditLog).where(eq(auditLog.action, "form.made"));
    expect(lines[0]).toMatchObject({ targetKind: "form", targetId: "Clinic site" });
  });

  it("refuses a member, a form without email, an unknown route and a site that isn't one", async () => {
    expect(await saveForm(app.db, { ...owner(), role: "member" }, form)).toMatchObject({ ok: false });
    expect(await saveForm(app.db, owner(), { ...form, fields: ["firstName"] })).toMatchObject({ ok: false, problems: ["fields: the email field (GHL matches contacts by it)"] });
    expect(await saveForm(app.db, owner(), { ...form, routeKey: "nowhere" })).toMatchObject({ ok: false, problems: ["routeKey: a route of this account"] });
    expect(await saveForm(app.db, owner(), { ...form, sites: ["<script>"] })).toMatchObject({ ok: false });
  });

  it("takes a lead with only the form's fields, once per opened form, then nothing once revoked", async () => {
    const [f] = await formsView(app.db, acc);
    const pub = await formByKey(app.db, f!.key);
    expect(pub).toMatchObject({ accountId: acc, routeKey: "trial", sites: ["northpine.com", "*.northpine.com"] });
    const { deps } = testDeps(app.db, fakeConnection());
    const opened = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const a = await embedLead(deps, pub!, opened, { email: "ana@northpine.example", firstName: "Ana", companyName: "Not asked", message: " Hello " });
    expect(a).toMatchObject({ ok: true, duplicate: false });
    if (!a.ok) throw new Error("refused");
    const [s] = await app.db.select().from(shipments).where(eq(shipments.id, a.waybill.id));
    expect(s).toMatchObject({ source: "embed", idempotencyKey: `embed-${pub!.id}-${opened}` });
    expect(s!.contact).toEqual({ email: "ana@northpine.example", firstName: "Ana", message: "Hello" });
    expect(await embedLead(deps, pub!, opened, { email: "ana@northpine.example" })).toMatchObject({ ok: true, duplicate: true, waybill: { id: a.waybill.id } });
    expect((await formsView(app.db, acc))[0]!.leads30).toBe(1);

    expect(await revokeForm(app.db, { ...owner(), role: "member" }, f!.id)).toBe(false);
    expect(await revokeForm(app.db, owner(), f!.id)).toBe(true);
    expect(await formByKey(app.db, f!.key)).toBeNull();
    expect(await formsView(app.db, acc)).toEqual([]);
    expect(await formByKey(app.db, "fwf_not-a-key")).toBeNull();
  });

  it("changes a form but never its key", async () => {
    const made = await saveForm(app.db, owner(), form);
    if (!made.ok) throw new Error("not made");
    const changed = await saveForm(app.db, owner(), { ...form, theme: "dark", sites: [] }, made.id);
    expect(changed).toMatchObject({ ok: true, key: made.key });
    const [row] = await app.db.select().from(embedForms).where(eq(embedForms.id, made.id));
    expect(row).toMatchObject({ theme: "dark", sites: [] });
  });
});
