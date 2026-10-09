import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { recordNotFound, recordRedirectHit, routingState } from "@/lib/routing/registry";
import { canonicalRedirectUrl } from "@/lib/routing/host";

const SESSION_COOKIE = "wta_session";
// Uygulamanın kendi rotaları (sayfa tablosunda olmayan ama 404 sayılmaması gerekenler)
const APP_PREFIXES = ["/yonetim", "/api", "/medya", "/_next", "/og", "/health"];
// Bilinmeyen adreslerin ortak 404 hedefi. Alt çizgi sayfa URL'lerinde geçersizdir
// (validatePath), bu yüzden hiçbir zaman gerçek bir sayfayla çakışmaz.
export const NOT_FOUND_PATH = "/_bulunamadi";

/** Sayfa rotası URL parçalarını çözerek arar (pathFromSegments); bilinen-yol kontrolü de aynısını yapar. */
function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = req.nextUrl;

  // Kanonik alan adı (www ↔ çıplak alan adı, http → https) tek adımda 301
  const canonical = canonicalRedirectUrl(process.env.SITE_URL, req.headers.get("x-forwarded-host") ?? req.headers.get("host"), req.headers.get("x-forwarded-proto"), (/[A-Z]/.test(pathname) ? pathname.toLowerCase() : pathname) + search);
  if (canonical) return NextResponse.redirect(canonical, 301);

  // Yönetim paneli: oturum çerezi yoksa girişe. Gerçek doğrulama layout'ta yapılır.
  if (pathname === "/yonetim" || pathname.startsWith("/yonetim/")) {
    const res =
      pathname !== "/yonetim/giris" && !req.cookies.get(SESSION_COOKIE)
        ? NextResponse.redirect(new URL(`/yonetim/giris?sonra=${encodeURIComponent(pathname)}`, req.url))
        : NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // SEO URL kuralı: büyük harfli adresleri küçük harfe kalıcı yönlendir.
  if (/[A-Z]/.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 301);
  }

  let state;
  try {
    state = await routingState();
  } catch {
    return NextResponse.next(); // DB erişilemezse site yine de açılsın
  }

  const redirect = state.redirects.get(pathname);
  if (redirect) {
    event.waitUntil(recordRedirectHit(redirect.id).catch(() => {}));
    const target = /^https?:\/\//.test(redirect.to) ? redirect.to : new URL(redirect.to + search, req.url);
    return NextResponse.redirect(target, redirect.code);
  }

  // NOT_FOUND_PATH bilinen sayılır: yeniden yazma bir gün dış adres sayılıp (sunucu HOSTNAME'i
  // proxy'nin gördüğü adresten farklıysa) isteğe geri dönerse döngü oluşmaz.
  const known =
    pathname === NOT_FOUND_PATH || state.published.has(decodedPath(pathname)) || APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!known && req.method === "GET") {
    event.waitUntil(recordNotFound(pathname, req.headers.get("referer"), req.headers.get("user-agent")).catch(() => {}));
  }

  // Bilinmeyen adresler tek bir 404 adresine yazılır: aksi hâlde her bot denemesi
  // (/wp-login.php, /.env …; POST dahil) ISR önbelleğinde ayrı bir 404 kaydı (HTML + RSC) bırakır.
  // Hedef aynı rotadır ([...path]); ziyaretçi aynı 404 sayfasını ve durum kodunu görür, adres çubuğu değişmez.
  const res = known ? NextResponse.next() : NextResponse.rewrite(new URL(NOT_FOUND_PATH, req.url));
  // Parametreli URL'ler indekslenmesin; canonical zaten temiz adresi gösterir.
  if (search && search !== "?") res.headers.set("X-Robots-Tag", "noindex, follow");
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/|api/|medya/|favicon.ico|icon|apple-icon|sitemap|robots.txt|manifest|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|txt|xml|woff2?)$).*)",
  ],
};
