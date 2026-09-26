import Link from "next/link";
import type { NavLinks } from "@/lib/seo/graph";

type Props = { nav: NavLinks; siteName: string; logo: { url: string; width: number; height: number } | null; phone?: string };

export function Header({ nav, siteName, logo, phone }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <a href="#icerik" className="skip-link">İçeriğe geç</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo.url} alt={siteName} width={logo.width} height={logo.height} className="h-8 w-auto" />
          ) : (
            <>
              <svg aria-hidden viewBox="0 0 64 64" className="h-8 w-8 shrink-0"><rect width="64" height="64" rx="14" fill="#14161a" /><path d="M12 46V19l16 16 16-16v27" fill="none" stroke="#f7f5f0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="53.5" cy="45.5" r="4.5" fill="#e8531f" /></svg>
              <span className="text-[15px]">{siteName}</span>
            </>
          )}
        </Link>
        <nav aria-label="Ana menü" className="hidden items-center gap-1 lg:flex">
          {nav.header.map((l) => (
            <Link key={l.path} href={l.path} className="rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-card hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="hidden whitespace-nowrap px-2 text-sm font-semibold text-ink-soft hover:text-ink xl:inline">
              {phone}
            </a>
          )}
          <Link href="/teklif-al" className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-transform hover:-translate-y-px sm:inline-flex">
            Teklif Al
          </Link>
          <details className="relative lg:hidden">
            <summary aria-label="Menüyü aç" className="grid h-10 w-10 place-items-center rounded-full border border-line">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </summary>
            <nav aria-label="Mobil menü" className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-card p-2 shadow-xl">
              {nav.header.map((l) => (
                <Link key={l.path} href={l.path} className="block rounded-xl px-3 py-2.5 text-[15px] hover:bg-paper">{l.label}</Link>
              ))}
              <Link href="/teklif-al" className="mt-1 block rounded-xl bg-accent px-3 py-2.5 text-center font-semibold text-accent-ink">Teklif Al</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
