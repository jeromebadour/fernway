import type { Metadata, Viewport } from "next";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/archivo-narrow/500.css";
import "@fontsource/archivo-narrow/600.css";
import "@fontsource/archivo-narrow/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@/ui/tokens.css";

export const metadata: Metadata = {
  title: "Fernway · Lead delivery for GoHighLevel",
  description:
    "Fernway carries every form, booking and payment from your site into GoHighLevel, re-sends anything GHL refuses, and keeps the receipt.",
  // Not indexed until launch (plan step 11).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a1019" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
