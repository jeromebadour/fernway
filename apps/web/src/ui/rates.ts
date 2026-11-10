// Fernway's plans (Kami 2026-11-10 03:14): priced by leads signed for in GHL. Held and returned leads never count.
export const rates = [
  {
    plan: "Starter", price: 19, leads: 500, note: "Forms, the embed and WordPress", team: "2 people",
    has: ["Trial, demo and contact forms with tracking receipts", "The embed form for any site or GHL funnel", "The WordPress plugin and Elementor widget"],
  },
  {
    plan: "Growth", price: 49, leads: 5000, note: "Plus bookings and payments", team: "5 people", pick: true,
    has: ["Everything in Starter", "Demo bookings from your GHL calendar, kept in step both ways", "Stripe payments that move the contact to Customer"],
  },
  {
    plan: "Scale", price: 149, leads: 25000, note: "Plus the API, webhooks out and Sheets", team: "No limit",
    has: ["Everything in Growth", "Fernway's API, with OpenAPI docs, and the Laravel package", "Webhooks out for n8n and Make, and a live Google Sheets export"],
  },
] as const;

export const perLead = (price: number, leads: number) => `${((price / leads) * 100).toFixed(2)}¢`;

/** The smallest plan that covers a month's leads; past the largest, the largest. */
export const planFor = (leads: number) => rates.find((r) => leads <= r.leads) ?? rates[rates.length - 1]!;
