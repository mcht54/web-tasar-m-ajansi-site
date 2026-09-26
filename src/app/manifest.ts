import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

// Web uygulama manifesti: ana ekrana ekleme ve tarayıcı ikonları (marka ikonları yerel).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  return {
    name: s.site.siteName,
    short_name: s.site.siteName.slice(0, 12),
    start_url: "/",
    display: "browser",
    background_color: "#f7f5f0",
    theme_color: "#14161a",
    lang: "tr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
