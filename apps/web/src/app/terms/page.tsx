import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/legal.css";
import { terms } from "@/ui/legal";
import { LegalPage } from "@/ui/legal-page";

export const metadata: Metadata = { title: "Terms of Use · Fernway" };
export default function Terms() {
  return <LegalPage doc={terms} current="/terms" />;
}
