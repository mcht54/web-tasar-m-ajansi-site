import Link from "next/link";
import type { Crumb } from "@/lib/seo/breadcrumbs";
import type { LinkGroup } from "@/lib/seo/graph";

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Konum" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>›</span>}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="text-ink-soft">{c.label}</span>
            ) : (
              <Link href={c.path} className="hover:text-ink">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({ crumbs, eyebrow, title, intro, children }: {
  crumbs: Crumb[]; eyebrow?: string | null; title: string; intro?: string | null; children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
      <Breadcrumbs crumbs={crumbs} />
      {eyebrow && <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
      <h1 className={`${eyebrow ? "mt-3" : "mt-8"} max-w-4xl font-display text-[clamp(2.4rem,1.6rem+3.6vw,4.4rem)] leading-[1.02] tracking-[-0.02em]`}>{title}</h1>
      {intro && <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink-soft">{intro}</p>}
      {children}
    </section>
  );
}

export function CtaButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-3 ${compact ? "" : "mt-8"}`}>
      <Link href="/teklif-al" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink transition-transform hover:-translate-y-px">
        Teklif Al <span aria-hidden>→</span>
      </Link>
      <Link href="/teklif-al#on-analiz" className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 font-semibold hover:border-ink">
        Ücretsiz Ön Analiz
      </Link>
    </div>
  );
}

export function Prose({ html }: { html: string }) {
  if (!html.trim()) return null;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function LinkGroups({ groups, skip = [] }: { groups: LinkGroup[]; skip?: string[] }) {
  const list = groups.filter((g) => !skip.includes(g.key));
  if (!list.length) return null;
  return (
    <div className="space-y-10">
      {list.map((g) => (
        <section key={g.key} aria-labelledby={`lg-${g.key}`}>
          <h2 id={`lg-${g.key}`} className="font-display text-2xl">{g.title}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {g.links.map((l) => (
              <li key={l.path}>
                <Link href={l.path} className="inline-block rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Faq({ items, title = "Sık sorulan sorular" }: { items: { q: string; a: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="sss" className="mx-auto max-w-6xl px-4 sm:px-6">
      <h2 id="sss" className="font-display text-[clamp(1.8rem,1.4rem+1.6vw,2.6rem)]">{title}</h2>
      <div className="mt-6 divide-y divide-line border-y border-line">
        {items.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex items-start justify-between gap-6 text-lg font-semibold">
              <h3>{f.q}</h3>
              <span aria-hidden className="mt-1 text-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CtaBand({ title = "Projenizi konuşalım", text, whatsapp }: { title?: string; text?: string; whatsapp?: string }) {
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-12 text-paper sm:px-12">
        <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
        <p className="font-display text-[clamp(2rem,1.5rem+2vw,3.2rem)] leading-tight">{title}</p>
        <p className="mt-3 max-w-2xl text-paper/75">
          {text ?? "Hedeflerinizi, müşterilerinizi ve varsa mevcut sitenizi konuşalım; size uygun kapsamı ve kalem kalem açıklanmış bir teklif hazırlayalım."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/teklif-al" className="rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink">Projenizi Konuşalım</Link>
          <Link href="/teklif-al#on-analiz" className="rounded-full border border-paper/30 px-5 py-3 font-semibold hover:border-paper">Ücretsiz Ön Analiz</Link>
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Merhaba, web siteniz üzerinden yazıyorum.")}`} rel="noopener" className="rounded-full border border-paper/30 px-5 py-3 font-semibold hover:border-paper">
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export function MobileActionBar({ phone, whatsapp }: { phone: string; whatsapp: string }) {
  if (!phone && !whatsapp) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-flow-col gap-2 border-t border-line bg-card/95 p-2 backdrop-blur md:hidden">
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="rounded-xl bg-ink py-3 text-center text-sm font-semibold text-paper">Ara</a>}
      {whatsapp && (
        <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} rel="noopener" className="rounded-xl bg-[#0f6e46] py-3 text-center text-sm font-semibold text-white">WhatsApp</a>
      )}
      <Link href="/teklif-al" className="rounded-xl bg-accent py-3 text-center text-sm font-semibold text-accent-ink">Teklif Al</Link>
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
