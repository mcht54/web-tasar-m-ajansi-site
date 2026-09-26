import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <p className="font-display text-7xl text-accent">404</p>
      <h1 className="mt-4 font-display text-4xl">Aradığınız sayfa bulunamadı</h1>
      <p className="mt-4 text-ink-soft">Sayfa taşınmış veya kaldırılmış olabilir.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-full bg-ink px-5 py-3 font-semibold text-paper">Ana sayfa</Link>
        <Link href="/web-tasarim" className="rounded-full border border-line px-5 py-3 font-semibold">Web tasarım</Link>
        <Link href="/teklif-al" className="rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink">Teklif Al</Link>
      </div>
    </section>
  );
}
