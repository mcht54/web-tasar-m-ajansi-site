import Link from "next/link";
import { renderMarkdown } from "@/lib/text/markdown";
import { buildBreadcrumbs } from "@/lib/seo/breadcrumbs";
import type { SiteGraph } from "@/lib/seo/graph";
import type { AllSettings } from "@/lib/settings-schema";
import { siteHost } from "@/lib/env";
import { fillTokens, getBlogList, getBodyMedia, getPublishedReferences, type PublicPage } from "@/lib/site/public";
import { pageJsonLd } from "@/lib/site/seo-render";
import { db } from "@/lib/db";
import { mediaSources, mediaUrl, type MediaVariant } from "@/lib/media/urls";
import { CtaBand, CtaButtons, Faq, LinkGroups, PageHero, Prose, formatDate } from "./Blocks";
import { LeadForm } from "./LeadForm";
import { HomeView } from "./home/HomeView";

type Props = {
  page: PublicPage & { faqItems: { q: string; a: string }[] };
  settings: AllSettings;
  graph: SiteGraph;
  logoUrl: string | null;
};

const TYPE_EYEBROW: Record<string, string> = {
  SERVICE: "Hizmet",
  SERVICE_LOCATION: "Hizmet bölgesi",
  CITY: "Şehir",
  DISTRICT: "İlçe",
  SECTOR: "Sektör",
  SECTOR_LOCATION: "Sektör",
};

export async function PageView({ page, settings, graph, logoUrl }: Props) {
  const node = graph.get(page.path);
  const crumbs = buildBreadcrumbs(page.path, page.breadcrumbLabel || page.name, graph);
  const templateGroups = node ? graph.templateLinks(node) : [];
  // Otonom iç link motorunun eklediği bağlantılar (yalnızca yayındaki hedefler)
  const related = (Array.isArray(page.relatedLinks) ? (page.relatedLinks as { path: string; anchor: string }[]) : [])
    .filter((l) => graph.get(l.path)?.published && l.path !== page.path && !templateGroups.some((g) => g.links.some((x) => x.path === l.path)))
    .map((l) => ({ path: l.path, label: l.anchor }));
  const groups = related.length ? [{ key: "related", title: "İlgili sayfalar", links: related }, ...templateGroups] : templateGroups;
  const body = page.type === "STATIC" ? fillTokens(page.body ?? "", settings) : page.body ?? "";
  const media = await getBodyMedia(body);
  const html = renderMarkdown(body, { media, siteHost: siteHost() });
  const jsonLd = pageJsonLd(page, settings, crumbs, logoUrl);
  const title = page.h1 || page.name;
  const ld = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />;

  if (page.type === "HOME") return <>{ld}<HomeView page={page} html={html} graph={graph} settings={settings} related={related} /></>;

  if (page.type === "BLOG_POST") {
    return (
      <article>
        {ld}
        <PageHero crumbs={crumbs} eyebrow={page.category} title={title} intro={page.intro}>
          <p className="mt-6 text-sm text-muted">
            {page.authorName ? `${page.authorName} · ` : ""}
            <time dateTime={page.publishedAt ?? undefined}>{formatDate(page.publishedAt)}</time>
            {page.contentUpdatedAt && page.publishedAt && page.contentUpdatedAt.slice(0, 10) > page.publishedAt.slice(0, 10) && (
              <> · Güncellendi: <time dateTime={page.contentUpdatedAt}>{formatDate(page.contentUpdatedAt)}</time></>
            )}
          </p>
        </PageHero>
        <div className="mx-auto max-w-6xl px-4 sm:px-6"><Prose html={html} /></div>
        <div className="mt-16"><Faq items={page.faqItems} /></div>
        <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6"><LinkGroups groups={groups} /></div>
        <CtaBand whatsapp={settings.site.whatsapp} />
      </article>
    );
  }

  if (page.type === "BLOG_INDEX") {
    const posts = await getBlogList();
    return (
      <>
        {ld}
        <PageHero crumbs={crumbs} title={title} intro={page.intro} />
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.path} href={p.path} className="group flex flex-col rounded-3xl border border-line bg-card p-6 transition-colors hover:border-ink">
              {p.category && <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{p.category}</span>}
              <h2 className="mt-3 font-display text-2xl leading-tight group-hover:underline">{p.h1 || p.name}</h2>
              {p.excerpt && <p className="mt-3 text-ink-soft">{p.excerpt}</p>}
              <time className="mt-auto pt-6 text-sm text-muted" dateTime={p.publishedAt ?? undefined}>{formatDate(p.publishedAt)}</time>
            </Link>
          ))}
        </div>
        <CtaBand whatsapp={settings.site.whatsapp} />
      </>
    );
  }

  if (page.type === "STATIC") {
    const isForm = page.path === "/teklif-al";
    const isContact = page.path === "/iletisim";
    return (
      <>
        {ld}
        <PageHero crumbs={crumbs} title={title} intro={page.intro} />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {isForm ? <Form sourcePath={page.path} /> : isContact ? <Contact settings={settings} /> : <Prose html={html} />}
          </div>
          {(isForm || isContact) && (
            <aside className="space-y-8">
              {isForm ? (
                <div id="on-analiz" className="rounded-3xl border border-line bg-card p-6">
                  <p className="font-display text-2xl">Ücretsiz ön analiz</p>
                  <p className="mt-2 text-ink-soft">
                    Mevcut bir siteniz varsa adresini mesaja ekleyin; hız, mobil uyum ve temel SEO durumunu inceleyip bulgularımızı paylaşalım.
                  </p>
                  <div className="prose mt-4 text-[15px]" dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              ) : (
                <div className="rounded-3xl border border-line bg-card p-6">
                  <p className="font-display text-2xl">Teklif mi istiyorsunuz?</p>
                  <p className="mt-2 text-ink-soft">Kısa formu doldurun, ihtiyacınızı konuşmak için size dönelim.</p>
                  <CtaButtons />
                </div>
              )}
              <LinkGroups groups={groups} />
            </aside>
          )}
        </div>
        {page.faqItems.length > 0 && <div className="mt-16"><Faq items={page.faqItems} /></div>}
      </>
    );
  }

  // Hizmet, il, ilçe, sektör ve kombinasyon sayfaları
  const fmtN = (n: number | null | undefined) => (n == null ? null : n.toLocaleString("tr-TR"));
  const pv = page.province;
  const dv = page.district;
  const factRows: [string, string][] = pv && (page.type === "CITY" || page.type === "DISTRICT" || page.type === "SERVICE_LOCATION" || page.type === "SECTOR_LOCATION")
    ? ([
        ["Bölge", pv.region],
        ["Plaka", String(pv.id).padStart(2, "0")],
        ...(dv
          ? ([["İl", pv.name], ["İlçe nüfusu", fmtN(dv.population) && `${fmtN(dv.population)} (${dv.populationYear})`], ["Mahalle", fmtN(dv.neighborhoodCount)], ["Yüzölçümü", dv.areaKm2 && `${fmtN(dv.areaKm2)} km²`]] as [string, string | null][])
          : ([["Nüfus", fmtN(pv.population) && `${fmtN(pv.population)} (${pv.populationYear})`], ["İlçe", String(pv._count.districts)], ["Yüzölçümü", pv.areaKm2 && `${fmtN(pv.areaKm2)} km²`], ["Statü", pv.isMetropolitan ? "Büyükşehir" : null]] as [string, string | null][])),
      ].filter((r): r is [string, string] => Boolean(r[1])))
    : [];
  const facts = factRows.length ? (
    <figure className="mt-8">
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {factRows.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
      </dl>
      {pv?.dataSource && <figcaption className="mt-2 text-xs text-muted">Kaynak: {pv.dataSource}</figcaption>}
    </figure>
  ) : null;
  const refs = page.sector ? await getPublishedReferences(page.sector.slug) : [];
  return (
    <>
      {ld}
      <PageHero crumbs={crumbs} eyebrow={TYPE_EYEBROW[page.type]} title={title} intro={page.intro}>
        {facts}
        <CtaButtons />
        <p className="mt-6 text-xs text-muted">Son güncelleme: <time dateTime={page.contentUpdatedAt}>{formatDate(page.contentUpdatedAt)}</time></p>
      </PageHero>
      <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Prose html={html} />
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-line bg-card p-6">
            <p className="font-display text-2xl">Projenizi konuşalım</p>
            <p className="mt-2 text-sm text-ink-soft">Ücretsiz ön analiz ve kalem kalem açıklanmış teklif.</p>
            <Link href="/teklif-al" className="mt-5 block rounded-full bg-accent px-5 py-3 text-center font-semibold text-accent-ink">Teklif Al</Link>
          </div>
        </aside>
      </div>
      {refs.length > 0 && <References refs={refs} />}
      <div className="mt-16"><Faq items={page.faqItems} /></div>
      <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6"><LinkGroups groups={groups} /></div>
      <CtaBand whatsapp={settings.site.whatsapp} />
    </>
  );
}

type Ref = Awaited<ReturnType<typeof getPublishedReferences>>[number];

function References({ refs }: { refs: Ref[] }) {
  return (
    <section aria-labelledby="referanslar" className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
      <h2 id="referanslar" className="font-display text-[clamp(2rem,1.5rem+2vw,3rem)]">Referanslar</h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {refs.map((r) => (
          <figure key={r.id} className="overflow-hidden rounded-3xl border border-line bg-card">
            {r.image && (
              <picture>
                {mediaSources(r.image.variants as MediaVariant[]).map((s) => <source key={s.type} type={s.type} srcSet={s.srcset} sizes="(min-width:1024px) 360px, 100vw" />)}
                { }
                <img src={mediaUrl(r.image.filename)} alt={r.image.alt ?? r.name} width={r.image.width} height={r.image.height} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
              </picture>
            )}
            <figcaption className="p-5">
              <p className="font-semibold">{r.url ? <a href={r.url} rel="noopener">{r.name}</a> : r.name}</p>
              {r.description && <p className="mt-1 text-sm text-ink-soft">{r.description}</p>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

async function Form({ sourcePath }: { sourcePath: string }) {
  const [provinces, services] = await Promise.all([
    db.province.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  return (
    <LeadForm
      cities={provinces.map((p) => p.name).sort((a, b) => a.localeCompare(b, "tr"))}
      services={services.map((s) => s.name)}
      sourcePath={sourcePath}
    />
  );
}

function Contact({ settings }: { settings: AllSettings }) {
  const b = settings.business;
  const email = b.email || settings.site.email;
  const address = [b.street, b.district, b.city, b.postalCode].filter(Boolean).join(", ");
  const rows = [
    b.phone && { label: "Telefon", value: <a href={`tel:${b.phone.replace(/\s/g, "")}`}>{b.phone}</a> },
    settings.site.whatsapp && { label: "WhatsApp", value: <a href={`https://wa.me/${settings.site.whatsapp.replace(/\D/g, "")}`} rel="noopener">Mesaj gönderin</a> },
    email && { label: "E-posta", value: <a href={`mailto:${email}`}>{email}</a> },
    address && { label: "Adres", value: <address className="not-italic">{address}</address> },
  ].filter(Boolean) as { label: string; value: React.ReactNode }[];
  if (!rows.length) {
    return <p className="text-ink-soft">Bize ulaşmak için <Link href="/teklif-al" className="underline">teklif formunu</Link> kullanabilirsiniz.</p>;
  }
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map((r) => (
        <div key={r.label} className="grid gap-1 py-5 sm:grid-cols-[160px_1fr]">
          <dt className="text-sm text-muted">{r.label}</dt>
          <dd className="text-lg font-semibold [&_a]:underline [&_a]:decoration-accent [&_a]:underline-offset-4">{r.value}</dd>
        </div>
      ))}
      {b.openingHours.length > 0 && (
        <div className="grid gap-1 py-5 sm:grid-cols-[160px_1fr]">
          <dt className="text-sm text-muted">Çalışma saatleri</dt>
          <dd>{b.openingHours.map((h, i) => <p key={i}>{h.days.map(dayTr).join(", ")}: {h.opens}–{h.closes}</p>)}</dd>
        </div>
      )}
    </dl>
  );
}

const DAYS: Record<string, string> = { Monday: "Pzt", Tuesday: "Sal", Wednesday: "Çar", Thursday: "Per", Friday: "Cum", Saturday: "Cmt", Sunday: "Paz" };
const dayTr = (d: string) => DAYS[d] ?? d;
