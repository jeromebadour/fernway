import { describe, expect, it } from "vitest";
import { MAX_TRIES, RETRY_WAITS_MS, waitBeforeTry } from "../src/delivery.js";

describe("the delivery promise on the landing page", () => {
  it("is 8 tries", () => {
    expect(MAX_TRIES).toBe(8);
  });

  it("spreads them over about 24 hours", () => {
    const total = RETRY_WAITS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(23 * 3_600_000);
    expect(total).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it("waits longer before each retry", () => {
    RETRY_WAITS_MS.slice(1).forEach((wait, i) => expect(wait).toBeGreaterThan(RETRY_WAITS_MS[i]!));
  });

  it("sends the first try at once and stops after the eighth", () => {
    expect(waitBeforeTry(1)).toBe(0);
    expect(waitBeforeTry(2)).toBe(30_000);
    expect(waitBeforeTry(8)).toBe(15 * 3_600_000);
    expect(waitBeforeTry(9)).toBeNull();
  });
});
