import Link from "next/link";
import type { NavLinks } from "@/lib/seo/graph";
import { HeaderShell } from "./HeaderShell";

type Props = { nav: NavLinks; siteName: string; logo: { url: string; width: number; height: number } | null; phone?: string };

// Sabit ana menü: bölümler ana sayfadaki çapalara, Blog ve İletişim kendi sayfalarına gider.
// Veritabanındaki menü (nav.header) mobil menüde ayrıca listelenir; iç bağlantılar korunur.
const MAIN = [
  { path: "/#hizmetler", label: "Hizmetler" },
  { path: "/#calismalar", label: "Projeler" },
  { path: "/#surec", label: "Süreç" },
  { path: "/blog", label: "Blog" },
  { path: "/iletisim", label: "İletişim" },
];

export function Header({ nav, siteName, logo, phone }: Props) {
  const extra = nav.header.filter((l) => !MAIN.some((m) => m.path === l.path));
  return (
    <HeaderShell>
      <a href="#icerik" className="skip-link">İçeriğe geç</a>
      <div className="nav-pill glass mx-auto flex h-[52px] max-w-7xl items-center justify-between gap-4 rounded-full pl-3 pr-2 text-snow">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt={siteName} width={logo.width} height={logo.height} className="h-8 w-auto" />
          ) : (
            <>
              <svg aria-hidden viewBox="0 0 64 64" className="h-8 w-8 shrink-0"><rect width="64" height="64" rx="16" fill="#f4f2ec" /><path d="M12 46V19l16 16 16-16v27" fill="none" stroke="#0a0b0e" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="53.5" cy="45.5" r="4.5" fill="#ff4d1f" /></svg>
              <span className="text-[15px]">{siteName}</span>
            </>
          )}
        </Link>
        <nav aria-label="Ana menü" className="hidden items-center gap-0.5 lg:flex">
          {MAIN.map((l) => (
            <Link key={l.path} href={l.path} className="rounded-full px-3.5 py-2 text-sm text-snow/70 transition-colors hover:bg-white/8 hover:text-snow">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="hidden whitespace-nowrap px-3 text-sm font-semibold text-snow/70 hover:text-snow xl:inline">
              {phone}
            </a>
          )}
          <Link href="/teklif-al" className="cta-magnet hidden items-center gap-1.5 rounded-full bg-signal px-4 py-2.5 text-sm font-semibold text-white sm:inline-flex">
            Projenizi Başlatalım <span aria-hidden className="arrow">→</span>
          </Link>
          <details className="group relative lg:hidden">
            <summary aria-label="Menüyü aç" className="grid h-10 w-10 place-items-center rounded-full bg-white/8">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 8h16M4 16h16" className="origin-center transition-transform" /></svg>
            </summary>
            <nav aria-label="Mobil menü" className="absolute right-0 mt-3 max-h-[75vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl border border-white/10 bg-night-2 p-2 text-snow shadow-2xl">
              {MAIN.map((l) => (
                <Link key={l.path} href={l.path} className="block rounded-2xl px-4 py-3 font-display text-2xl hover:bg-white/8">{l.label}</Link>
              ))}
              {extra.length > 0 && (
                <div className="mt-1 border-t border-white/10 px-2 pt-2">
                  {extra.map((l) => (
                    <Link key={l.path} href={l.path} className="block rounded-xl px-2 py-2 text-[15px] text-snow/70 hover:text-snow">{l.label}</Link>
                  ))}
                </div>
              )}
              <Link href="/teklif-al" className="mt-2 block rounded-2xl bg-signal px-4 py-3 text-center font-semibold text-white">Projenizi Başlatalım</Link>
            </nav>
          </details>
        </div>
      </div>
    </HeaderShell>
  );
}
