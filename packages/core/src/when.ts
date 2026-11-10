// Dates and times the way the person chose in Preferences, in their own time zone (account pages and emails).
export type When = { dateStyle: "day-month" | "month-day" | "iso"; clock: "24h" | "12h"; timeZone: string };

export function day(iso: string | Date, w: When, year = true): string {
  const d = new Date(iso);
  if (w.dateStyle === "iso") {
    const p = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: w.timeZone }).format(d);
    return year ? p : p.slice(5);
  }
  return d.toLocaleDateString(w.dateStyle === "month-day" ? "en-US" : "en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: w.timeZone });
}

export function time(iso: string | Date, w: When, seconds = false): string {
  const d = new Date(iso);
  if (w.clock === "12h") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: true, timeZone: w.timeZone })
      .replace(" AM", " am").replace(" PM", " pm");
  }
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false, timeZone: w.timeZone });
}

export const stamp = (iso: string | Date, w: When) => `${day(iso, w)}, ${time(iso, w)}`;
