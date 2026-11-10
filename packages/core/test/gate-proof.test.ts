// Fails on purpose: proves the ruleset on main blocks a pull request whose CI fails. Never merged.
import { expect, it } from "vitest";
import { MAX_TRIES } from "../src/delivery.js";

it("the delivery promise is 9 tries (it is 8: this test must fail)", () => {
  expect(MAX_TRIES).toBe(9);
});
