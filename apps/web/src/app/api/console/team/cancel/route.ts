import { cancelInvite } from "@fernway/delivery";
import { delivery } from "@/lib/connect";
import { manager, outcome } from "@/lib/console-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const s = await manager(request);
  if ("refused" in s) return s.refused;
  return outcome(await cancelInvite(delivery().db, s.m, Number(s.body.id)));
}
