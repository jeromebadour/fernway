import { readTrackToken, trackView } from "@fernway/delivery";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// The receipt page asks this while the lead is still travelling. Only the signed link opens it.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { db, cfg } = delivery();
  const id = readTrackToken(cfg.key, (await params).token);
  const view = id === null ? null : await trackView(db, id);
  if (!view) return Response.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, view }, { headers: { "Cache-Control": "no-store" } });
}
