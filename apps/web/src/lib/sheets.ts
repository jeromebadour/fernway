import "server-only";
import { createSheets, serviceKeyFrom, type Sheets } from "@fernway/delivery";

// Fernway's own Google service account (GOOGLE_SHEETS_KEY), or null where it isn't set (Sheets then says so).
const g = globalThis as unknown as { fernwaySheets?: Sheets | null };
export function sheetsClient(): Sheets | null {
  if (g.fernwaySheets === undefined) {
    const key = serviceKeyFrom(process.env.GOOGLE_SHEETS_KEY);
    g.fernwaySheets = key ? createSheets({ key, baseUrl: process.env.FERNWAY_GOOGLE_API || undefined, tokenUrl: process.env.FERNWAY_GOOGLE_TOKEN || undefined }) : null;
  }
  return g.fernwaySheets;
}
