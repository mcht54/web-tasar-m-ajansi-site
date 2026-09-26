// Kanonik alan adı: www / çıplak alan adı ve http/https tutarlılığı.
// Yalnızca kanonik alan adının www varyantında veya yönlendirici (reverse proxy)
// açıkça http bildirdiğinde yönlendirir; yerel/iç adreslere asla dokunmaz
// (proxy arkasında iç Host başlığıyla döngü oluşmasın).

const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function canonicalRedirectUrl(siteUrl: string | undefined, host: string | null, forwardedProto: string | null, pathAndSearch: string): string | null {
  if (!siteUrl || !host) return null;
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  const canonical = site.hostname.toLowerCase();
  if (LOCAL.test(canonical)) return null;
  const reqHost = host.toLowerCase().split(":")[0];
  const wwwVariant = canonical.startsWith("www.") ? canonical.slice(4) : `www.${canonical}`;
  const proto = forwardedProto?.split(",")[0].trim().toLowerCase() ?? null;
  const wrongHost = reqHost === wwwVariant;
  const wrongProto = reqHost === canonical && site.protocol === "https:" && proto === "http";
  if (!wrongHost && !wrongProto) return null;
  return site.origin + pathAndSearch;
}
