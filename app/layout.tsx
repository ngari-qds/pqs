import type { Metadata, Viewport } from "next";
import { NEXT_FONTS } from "@/lib/fonts/next-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quote Studio · Fred M",
  description: "Personal quote image designer for Fred M | 1963ke",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={NEXT_FONTS.Inter.className}>{children}</body>
    </html>
  );
}
