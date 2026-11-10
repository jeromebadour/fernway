import { beginTwoStep } from "@fernway/delivery";
import QRCode from "qrcode";
import { answer, signedIn } from "@/lib/account-api";
import { delivery } from "@/lib/connect";

export const dynamic = "force-dynamic";

// Starts two-step: a fresh secret (kept sealed as pending) as a QR code and as text to type in.
export async function POST(request: Request) {
  const s = await signedIn(request);
  if ("refused" in s) return s.refused;
  const { db, cfg } = delivery();
  const { secret, uri } = await beginTwoStep(db, cfg.key, s.p.userId);
  const qr = await QRCode.toString(uri, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0a1019", light: "#eef2f6" } });
  return answer(200, { ok: true, secret: secret.match(/.{1,4}/g)!.join(" "), qr });
}
