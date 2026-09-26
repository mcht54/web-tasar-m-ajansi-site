import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { siteUrl } from "@/lib/env";
import "./globals.css";

// Yalnızca iki yazı tipi; Türkçe karakterler için latin-ext alt kümesi.
// display: optional → font geç gelirse metin yeniden çizilmez (LCP/CLS korunur).
const body = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "optional" });
const display = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-display",
  display: "optional",
  // Ön yükleme yok: gövde fontuyla bant genişliği yarışmasın (LCP). İlk ziyarette
  // geç gelirse başlıklar sistem serif fontuyla görünür; sonraki sayfalarda önbellekten.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
