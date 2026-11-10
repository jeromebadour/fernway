import { openApi } from "@fernway/delivery";
import { appUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(openApi(appUrl()), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
}
