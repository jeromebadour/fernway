import type { Metadata } from "next";
import { demoEmail, demoWhen } from "@/lib/operator-demo";
import { EmailView } from "../../../operator/_views/business";

export const metadata: Metadata = { title: "Email · Operator console demo · Fernway" };

export default function Email() {
  return <EmailView v={demoEmail()} w={demoWhen} />;
}
