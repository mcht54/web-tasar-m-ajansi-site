import "server-only";
// Herkese açık sayfaların veri katmanı. Tüm okumalar etiketli önbellekten gelir;
// yönetim panelinde kayıt yapıldığında ilgili etiket tazelenir.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { PAGES_TAG, getSiteGraph } from "./graph-data";
import { getSettings } from "../settings";
import { parseFaq } from "../seo/analyzer-shared";
import { extractMarkdown, type MediaInfo } from "../text/markdown";
import { mediaSources, mediaUrl, type MediaVariant } from "../media/urls";

export const MEDIA_TAG = "media";

const loadPage = unstable_cache(
  async (path: string) => {
    const p = await db.page.findUnique({
      where: { path },
      include: {
        service: { select: { name: true, slug: true, summary: true } },
        province: {
          select: {
            id: true, name: true, slug: true, region: true, population: true, populationYear: true, dataSource: true, areaKm2: true,
            altitude: true, isCoastal: true, isMetropolitan: true, neighborhoodCount: true, _count: { select: { districts: true } },
          },
        },
        district: { select: { name: true, slug: true, population: true, populationYear: true, areaKm2: true, neighborhoodCount: true } },
        sector: { select: { name: true, slug: true } },
        ogImage: { select: { filename: true, width: true, height: true, alt: true } },
      },
    });
    if (!p || p.status !== "PUBLISHED") return null;
    return JSON.parse(JSON.stringify(p)) as typeof p & { publishedAt: string | null; contentUpdatedAt: string; updatedAt: string };
  },
  ["public-page"],
  { tags: [PAGES_TAG], revalidate: 3600 },
);

export type PublicPage = NonNullable<Awaited<ReturnType<typeof loadPage>>>;

export const getPublicPage = cache(async (path: string) => {
  const p = await loadPage(path);
  if (!p) return null;
  return { ...p, faqItems: parseFaq(p.faq) };
});

const loadMediaMap = unstable_cache(
  async (files: string[]) => {
    if (!files.length) return [] as [string, MediaInfo][];
    const rows = await db.media.findMany({ where: { filename: { in: files } } });
    return rows.map((m) => [
      mediaUrl(m.filename),
      { width: m.width, height: m.height, alt: m.alt, sources: mediaSources(m.variants as MediaVariant[]) },
    ]) as [string, MediaInfo][];
  },
  ["media-map"],
  { tags: [MEDIA_TAG], revalidate: 3600 },
);

/** Gövdedeki /medya/ görsellerinin boyut ve varyant bilgisi (CLS olmasın diye). */
export async function getBodyMedia(body: string | null): Promise<Map<string, MediaInfo>> {
  const files = extractMarkdown(body)
    .images.map((i) => i.src)
    .filter((s) => s.startsWith("/medya/"))
    .map((s) => s.slice("/medya/".length));
  return new Map(await loadMediaMap([...new Set(files)].sort()));
}

export const getBlogList = unstable_cache(
  async () =>
    db.page
      .findMany({
        where: { type: "BLOG_POST", status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { path: true, name: true, h1: true, excerpt: true, category: true, publishedAt: true },
      })
      .then((r) => JSON.parse(JSON.stringify(r)) as { path: string; name: string; h1: string | null; excerpt: string | null; category: string | null; publishedAt: string | null }[]),
  ["blog-list"],
  { tags: [PAGES_TAG], revalidate: 3600 },
);

export const getServiceCards = unstable_cache(
  async () =>
    db.service.findMany({
      where: { active: true, pages: { some: { type: "SERVICE", status: "PUBLISHED" } } },
      orderBy: { sortOrder: "asc" },
      select: { name: true, summary: true, pages: { where: { type: "SERVICE" }, select: { path: true } } },
    }),
  ["service-cards"],
  { tags: [PAGES_TAG], revalidate: 3600 },
);

export const getPublishedReferences = unstable_cache(
  async (sectorSlug?: string) =>
    db.reference
      .findMany({
        where: { published: true, ...(sectorSlug ? { sector: { slug: sectorSlug } } : {}) },
        orderBy: { sortOrder: "asc" },
        take: 6,
        include: { image: { select: { filename: true, width: true, height: true, alt: true, variants: true } } },
      })
      .then((r) => JSON.parse(JSON.stringify(r)) as typeof r),
  ["references"],
  { tags: [PAGES_TAG, MEDIA_TAG], revalidate: 3600 },
);

/**
 * Ana sayfanın "kanıt" bölümü için yalnızca veritabanından ölçülen gerçek sayılar.
 * Ortalama SEO skoru sitenin kendi analiz motorunun yayındaki sayfalar için hesapladığı değerdir.
 */
export const getHomeStats = unstable_cache(
  async () => {
    const [byType, avg, services] = await Promise.all([
      db.page.groupBy({ by: ["type"], where: { status: "PUBLISHED" }, _count: true }),
      db.page.aggregate({ where: { status: "PUBLISHED", seoScore: { not: null } }, _avg: { seoScore: true }, _count: { seoScore: true } }),
      db.service.count({ where: { active: true, pages: { some: { type: "SERVICE", status: "PUBLISHED" } } } }),
    ]);
    const n = (t: string) => byType.find((x) => x.type === t)?._count ?? 0;
    return {
      published: byType.reduce((s, x) => s + x._count, 0),
      services,
      sectors: n("SECTOR"),
      guides: n("BLOG_POST"),
      avgSeo: avg._avg.seoScore != null ? Math.round(avg._avg.seoScore) : null,
      scored: avg._count.seoScore,
    };
  },
  ["home-stats"],
  { tags: [PAGES_TAG], revalidate: 3600 },
);

/**
 * Ana sayfa vitrini: bu sitenin kendi yayındaki sayfaları (gerçek başlık, giriş, SEO skoru, SSS sayısı).
 * Müşteri referansı değildir; arayüzde de öyle etiketlenir. Yayında olmayan yol sessizce atlanır.
 */
export const getShowcasePages = unstable_cache(
  async (paths: string[]) => {
    const rows = await db.page.findMany({
      where: { path: { in: paths }, status: "PUBLISHED" },
      select: { path: true, type: true, name: true, h1: true, intro: true, primaryKeyword: true, seoScore: true, faq: true, schemaDisabled: true, body: true },
    });
    return paths
      .map((p) => rows.find((r) => r.path === p))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(({ faq, body, ...r }) => ({
        ...r,
        faqCount: parseFaq(faq).length,
        words: (body ?? "").split(/\s+/).filter(Boolean).length,
      }));
  },
  ["showcase-pages"],
  { tags: [PAGES_TAG], revalidate: 3600 },
);

export const getLogo = unstable_cache(
  async (id: string) => {
    if (!id) return null;
    const m = await db.media.findUnique({ where: { id }, select: { filename: true, width: true, height: true } });
    return m ? { url: mediaUrl(m.filename), width: m.width, height: m.height } : null;
  },
  ["media-by-id"],
  { tags: [MEDIA_TAG], revalidate: 3600 },
);

export async function getSiteChrome() {
  const [settings, { graph, nav }] = await Promise.all([getSettings(), getSiteGraph()]);
  const logo = await getLogo(settings.site.logoId);
  return { settings, graph, nav, logo };
}

/** KVKK gibi şablon metinlerde {{isletme_adi}} vb. yer tutucuları doldurur. */
export function fillTokens(text: string, s: Awaited<ReturnType<typeof getSettings>>): string {
  const b = s.business;
  const address = [b.street, b.district, b.city].filter(Boolean).join(", ");
  const map: Record<string, string> = {
    isletme_adi: b.legalName || b.name || s.site.siteName,
    adres: address || "[adres ayarlardan girilmeli]",
    eposta: b.email || s.site.email || "[e-posta ayarlardan girilmeli]",
    telefon: b.phone || "[telefon ayarlardan girilmeli]",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => map[k] ?? m);
}
