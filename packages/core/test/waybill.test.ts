import { describe, expect, it } from "vitest";
import { formatWaybill, parseWaybill } from "../src/waybill.js";

describe("waybill numbers", () => {
  it("formats the readable and the URL form", () => {
    expect(formatWaybill({ year: 24, seq: 817 })).toBe("FW 24 00817");
    expect(formatWaybill({ year: 24, seq: 817 }, "-")).toBe("FW-24-00817");
    expect(formatWaybill({ year: 3, seq: 1 })).toBe("FW 03 00001");
  });

  it("reads back what it writes, in either form", () => {
    expect(parseWaybill("FW 24 00817")).toEqual({ year: 24, seq: 817 });
    expect(parseWaybill("fw-24-00817")).toEqual({ year: 24, seq: 817 });
  });

  it("refuses anything that is not a waybill number", () => {
    for (const bad of ["", "FW 24 817", "FW 24 00000", "XX 24 00817", "FW 24 008170", "FW2400817"]) {
      expect(parseWaybill(bad)).toBeNull();
    }
    expect(() => formatWaybill({ year: 100, seq: 1 })).toThrow(RangeError);
    expect(() => formatWaybill({ year: 24, seq: 0 })).toThrow(RangeError);
  });
});
