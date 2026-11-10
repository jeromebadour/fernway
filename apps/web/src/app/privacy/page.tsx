import type { Metadata } from "next";
import "@/ui/site.css";
import "@/ui/forms.css";
import "@/ui/legal.css";
import { privacy } from "@/ui/legal";
import { LegalPage } from "@/ui/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Fernway" };
export default function Privacy() {
  return <LegalPage doc={privacy} current="/privacy" />;
}
