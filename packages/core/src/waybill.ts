// A waybill number names one lead's trip: "FW 24 00817" is the 817th lead of 2024's numbering year.
// The spaced form is what people read; the dashed form ("FW-24-00817") is what goes in a URL.

const PATTERN = /^FW[ -](\d{2})[ -](\d{5})$/;

export type WaybillNumber = { year: number; seq: number };

export function formatWaybill({ year, seq }: WaybillNumber, sep: " " | "-" = " "): string {
  if (!Number.isInteger(year) || year < 0 || year > 99) throw new RangeError(`waybill year out of range: ${year}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > 99_999) throw new RangeError(`waybill sequence out of range: ${seq}`);
  return ["FW", String(year).padStart(2, "0"), String(seq).padStart(5, "0")].join(sep);
}

export function parseWaybill(text: string): WaybillNumber | null {
  const m = PATTERN.exec(text.trim().toUpperCase());
  if (!m) return null;
  const seq = Number(m[2]);
  if (seq < 1) return null;
  return { year: Number(m[1]), seq };
}
