import { describe, expect, it } from "vitest";
import { apiLeadBody, openApi } from "../src/api.js";

describe("the API's contract", () => {
  it("takes the engine's own lead, with no source (Fernway sets it)", () => {
    expect(apiLeadBody.safeParse({ idempotencyKey: "order-1001", route: "trial", contact: { email: "a@b.co" } }).success).toBe(true);
    expect(apiLeadBody.safeParse({ idempotencyKey: "order-1001", route: "trial", source: "api", contact: { email: "a@b.co" } }).success).toBe(false);
  });

  it("documents both endpoints from the same schemas, request fields included", () => {
    const doc = openApi("https://fernway.example");
    const body = doc.paths["/api/v1/leads"].post.requestBody.content["application/json"].schema as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(body.properties).sort()).toEqual(["contact", "idempotencyKey", "route", "slot"]);
    expect(body.required.sort()).toEqual(["contact", "idempotencyKey", "route"]);
    const contact = body.properties.contact as { properties: Record<string, unknown> };
    expect(Object.keys(contact.properties)).toContain("phone");
    expect(JSON.stringify(doc)).toContain('"operationId":"getLead"');
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});

describe("the docs' examples", () => {
  it("are each real: they pass the schema they illustrate", async () => {
    const { examples, apiAccepted, apiProblem, apiLead } = await import("../src/api.js");
    expect(apiLeadBody.safeParse(examples.lead).success).toBe(true);
    expect(apiAccepted.safeParse(examples.accepted).success).toBe(true);
    expect(apiProblem.safeParse(examples.refused).success).toBe(true);
    expect(apiLead.safeParse(examples.lead817).success).toBe(true);
  });

  it("carry descriptions into the reference, for every lead field", () => {
    const body = openApi("x").paths["/api/v1/leads"].post.requestBody.content["application/json"].schema as {
      properties: Record<string, { description?: string; properties?: Record<string, { description?: string }> }>;
    };
    for (const [k, v] of Object.entries(body.properties)) expect(v.description, k).toBeTruthy();
    for (const [k, v] of Object.entries(body.properties.contact!.properties!)) expect(v.description, k).toBeTruthy();
  });
});
