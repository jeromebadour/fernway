import { formByKey, frameAncestors } from "@fernway/delivery";
import { NextResponse, type NextRequest } from "next/server";
import { delivery } from "@/lib/connect";

// An embed form may be framed only by the sites its owner listed (none listed: any https site); a closed or unknown
// form by none. Browsers enforce it from this header, so a page not on the list can't show the form at all.
const cache = new Map<string, { value: string; until: number }>();

async function ancestors(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const form = await formByKey(delivery().db, key).catch(() => null);
  const value = form ? frameAncestors(form.sites) : "'none'";
  if (cache.size > 2000) cache.clear();
  cache.set(key, { value, until: Date.now() + 30_000 });
  return value;
}

export async function proxy(request: NextRequest) {
  const key = request.nextUrl.pathname.split("/")[2] ?? "";
  const res = NextResponse.next();
  // The console's Preview opens the form on its own, not framed: nothing to allow.
  res.headers.set("Content-Security-Policy", `frame-ancestors ${await ancestors(key)}`);
  return res;
}

export const config = { matcher: ["/f/:key"] };
