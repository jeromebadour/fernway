import { freeTimes } from "@/lib/booking";

export const dynamic = "force-dynamic";

// The Book a demo page's free times (ISO, UTC); the page shows them in the visitor's own time zone.
export async function GET() {
  const r = await freeTimes("demo");
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
