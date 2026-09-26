import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Uçtan uca test sunucusu ayrı klasöre derlenir (geliştirme/üretim derlemesini ezmesin).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Standalone çıktı: Docker/VPS dağıtımında node_modules olmadan çalışır.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" }, // medya yükleme
    // Tailwind çıktısı küçük; CSS'i HTML'e gömmek render'ı engelleyen isteği kaldırır (LCP).
    inlineCss: true,
  },
};

export default nextConfig;
