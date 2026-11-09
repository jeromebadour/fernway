import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Used by the container's health check and the deploy script. 200 only when the whole stack works.
export async function GET() {
  const health = await checkHealth();
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
