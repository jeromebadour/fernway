import { signOut } from "@fernway/delivery";
import { cookies } from "next/headers";
import { answer, gate } from "@/lib/account-api";
import { delivery } from "@/lib/connect";
import { endCookie, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Sign out here, or (others: true) every other device, keeping this one.
export async function POST(request: Request) {
  const g = await gate(request);
  if ("refused" in g) return g.refused;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return answer(200, { ok: true, next: "/sign-in" }, endCookie());
  if (g.body.others === true) {
    const n = await signOut(delivery().db, token, true);
    return answer(200, { ok: true, ended: n });
  }
  await signOut(delivery().db, token);
  return answer(200, { ok: true, next: "/sign-in?done=signed-out" }, endCookie());
}
