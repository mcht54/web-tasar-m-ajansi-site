import "server-only";
// Analiz motoru: tüm sayfaları tek geçişte değerlendirir.
//  1) Site grafiği + menü → her sayfanın gelen/giden iç linkleri
//  2) Şehir adları maskelenmiş parmak izleri → kopya içerik
//  3) Aynı ana kelimeyi hedefleyen sayfalar → cannibalization
//  4) SEO skoru, içerik kalite skoru, yayına hazırlık
//  5) Programatik sayfalarda yetersiz içerik → otomatik NOINDEX

import { db } from "../db";
import { Prisma } from "@/generated/prisma/client";
import { getSettingsFresh } from "../settings";
import type { AllSettings } from "../settings-schema";
import { getSiteGraphFresh } from "../site/graph-data";
import { type Edge, type NavLinks, type PageNode, SiteGraph, navPaths } from "./graph";
import { extractMarkdown, isInternalHref } from "../text/markdown";
import { fingerprintText, similarity } from "../text/analyze";
import { foldKeyword } from "../text/slug";
import { isSelfCanonical, resolveRobots, resolveTitle, resolveDescription } from "./meta";
import { buildBreadcrumbs } from "./breadcrumbs";
import { buildJsonLd, validateJsonLd } from "./schema";
import {
  type AnalysisInput, type QualityResult, type Readiness, type ScoreResult,
  applyCaps, autoNoindexDecision, computeContentQuality, computeReadiness, computeSeoScore,
} from "./score";
import { siteHost, siteUrl } from "../env";

export const pageInclude = {
  service: { select: { name: true, slug: true } },
  province: { select: { name: true } },
  district: { select: { name: true } },
  sector: { select: { name: true } },
  ogImage: { select: { filename: true } },
} satisfies Prisma.PageInclude;

export type FullPage = Prisma.PageGetPayload<{ include: typeof pageInclude }>;

import { parseFaq } from "./analyzer-shared";
export { parseFaq };

export type SiteState = {
  settings: AllSettings;
  graph: SiteGraph;
  nav: NavLinks;
  pages: FullPage[];
  locationNames: string[];
  fingerprints: Map<string, Set<number>>;
  edges: Edge[];
  perf: Map<string, { loadMs: number | null; bytes: number | null; hasViewport: boolean }>;
  keywordOwners: Map<string, string[]>; // katlanmış ana kelime → sayfa yolları
};

export function relatedOf(v: unknown): { path: string; anchor: string; reason?: string }[] {
  return Array.isArray(v) ? v.filter((x): x is { path: string; anchor: string } => !!x && typeof x.path === "string" && typeof x.anchor === "string") : [];
}

export function normalizePath(href: string): string | null {
  try {
    const u = new URL(href, siteUrl());
    if (u.host !== siteHost()) return null;
    const p = decodeURI(u.pathname).replace(/\/+$/, "");
    return p || "/";
  } catch {
    return null;
  }
}

function fingerprintSource(p: Pick<FullPage, "h1" | "intro" | "body" | "faq">): string {
  const md = extractMarkdown(p.body);
  const faq = parseFaq(p.faq).map((f) => `${f.q} ${f.a}`).join(" ");
  return [p.h1 ?? "", p.intro ?? "", md.text, faq].join("\n");
}

export async function loadSiteState(): Promise<SiteState> {
  const [settings, { graph, nav }, pages, provinces, districts, lastCrawl] = await Promise.all([
    getSettingsFresh(),
    getSiteGraphFresh(),
    db.page.findMany({ where: { status: { not: "ARCHIVED" } }, include: pageInclude }),
    db.province.findMany({ select: { name: true } }),
    db.district.findMany({ select: { name: true } }),
    db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" }, select: { id: true } }),
  ]);
  const locationNames = [...new Set([...provinces.map((p) => p.name), ...districts.map((d) => d.name)])];

  const fingerprints = new Map<string, Set<number>>();
  for (const p of pages) {
    const text = fingerprintSource(p);
    if (text.split(/\s+/).length >= 80) fingerprints.set(p.path, fingerprintText(text, locationNames));
  }

  const perf = new Map<string, { loadMs: number | null; bytes: number | null; hasViewport: boolean }>();
  if (lastCrawl) {
    const rows = await db.crawlPage.findMany({
      where: { runId: lastCrawl.id },
      select: { url: true, loadMs: true, bytes: true, hasViewport: true },
    });
    for (const r of rows) {
      const path = normalizePath(r.url);
      if (path) perf.set(path, { loadMs: r.loadMs, bytes: r.bytes, hasViewport: r.hasViewport });
    }
  }

  const edges = computeEdges(graph, nav, pages);

  const keywordOwners = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.primaryKeyword?.trim()) continue;
    if (p.status !== "PUBLISHED" && !p.body?.trim()) continue; // boş taslaklar rekabet etmez
    const k = foldKeyword(p.primaryKeyword);
    keywordOwners.set(k, [...(keywordOwners.get(k) ?? []), p.path]);
  }

  return { settings, graph, nav, pages, locationNames, fingerprints, edges, perf, keywordOwners };
}

/** Yalnızca yayımlanmış sayfalardan çıkan linkler (taslaklar render edilmez). */
export function computeEdges(graph: SiteGraph, nav: NavLinks, pages: FullPage[]): Edge[] {
  const edges: Edge[] = [];
  const navList = [...nav.header, ...nav.footerServices, ...nav.footerSectors, ...nav.footerCompany];
  const bodyByPath = new Map(pages.map((p) => [p.path, p.body]));
  const relatedByPath = new Map(pages.map((p) => [p.path, p.relatedLinks]));
  const host = siteHost();
  for (const n of graph.nodes) {
    if (!n.published) continue;
    for (const l of navList) if (l.path !== n.path) edges.push({ from: n.path, to: l.path, anchor: l.label, kind: "nav" });
    edges.push({ from: n.path, to: "/", anchor: "logo", kind: "nav" });
    for (const g of graph.templateLinks(n))
      for (const l of g.links) edges.push({ from: n.path, to: l.path, anchor: l.label, kind: "template" });
    for (const l of relatedOf(relatedByPath.get(n.path))) edges.push({ from: n.path, to: l.path, anchor: l.anchor, kind: "body" });
    for (const l of extractMarkdown(bodyByPath.get(n.path)).links) {
      if (!isInternalHref(l.href, host)) continue;
      const to = normalizePath(l.href);
      if (to && to !== n.path) edges.push({ from: n.path, to, anchor: l.text, kind: "body" });
    }
  }
  return edges;
}

export type PageAnalysis = {
  seo: ScoreResult;
  quality: QualityResult;
  readiness: Readiness;
  autoNoindex: { noindex: boolean; reason: string | null };
  title: string;
  description: string;
  inlinks: number;
  navInlinks: number;
  outlinks: number;
  similar: { path: string | null; score: number };
  schemaTypes: string[];
  schemaIssues: { type: string; level: string; message: string }[];
  potentialInlinks: boolean;
};

/**
 * Tek sayfayı analiz eder. `page` kaydedilmemiş düzenleme olabilir (editörde
 * canlı önizleme); site durumu kayıtlı sürümden gelir.
 */
export function analyzePage(page: FullPage, state: SiteState): PageAnalysis {
  const { settings } = state;
  const base = siteUrl();
  const md = extractMarkdown(page.body);
  const faq = parseFaq(page.faq);
  const title = resolveTitle(page, settings.seo);
  const description = resolveDescription(page, settings.seo);
  const selfCanonical = isSelfCanonical(page, base);

  // Yayında olsaydı indekslenebilir miydi? (durum ve otomatik NOINDEX hariç)
  const robots = resolveRobots(
    { ...page, status: "PUBLISHED", autoNoindex: false },
    settings.seo.allowIndexing,
    selfCanonical,
  );

  // Gelen linkler: sayfa taslaksa, yayımlanınca alacağı linkleri hesaplarız.
  let inEdges = state.edges.filter((e) => e.to === page.path && e.from !== page.path);
  let potentialInlinks = false;
  const node = state.graph.get(page.path);
  if (node && !node.published) {
    potentialInlinks = true;
    const hypo = new SiteGraph(state.graph.nodes.map((n) => (n.path === page.path ? { ...n, published: true } : n)));
    const extra: Edge[] = [];
    for (const src of hypo.nodes) {
      if (!src.published || src.path === page.path) continue;
      for (const g of hypo.templateLinks(src))
        for (const l of g.links) if (l.path === page.path) extra.push({ from: src.path, to: page.path, anchor: l.label, kind: "template" });
    }
    inEdges = [...inEdges, ...extra];
  }
  const navInlinks = new Set(inEdges.filter((e) => e.kind === "nav").map((e) => e.from)).size;
  const inlinks = new Set(inEdges.filter((e) => e.kind !== "nav").map((e) => e.from)).size;

  // Giden bağlamsal linkler: şablon + gövde
  const selfNode: PageNode | undefined = node && { ...node, published: true };
  const templateOut = selfNode ? state.graph.templateLinks(selfNode).flatMap((g) => g.links.map((l) => l.path)) : [];
  const bodyOut = md.links
    .filter((l) => isInternalHref(l.href, siteHost()))
    .map((l) => normalizePath(l.href))
    .filter((p): p is string => !!p && p !== page.path);
  const outlinks = new Set([...templateOut, ...bodyOut, ...relatedOf(page.relatedLinks).map((l) => l.path)]).size;

  // Kopya içerik
  let similar = { path: null as string | null, score: 0 };
  const text = fingerprintSource(page);
  if (text.split(/\s+/).length >= 80) {
    const fp = fingerprintText(text, state.locationNames);
    for (const [path, other] of state.fingerprints) {
      if (path === page.path) continue;
      const s = similarity(fp, other);
      if (s > similar.score) similar = { path, score: s };
    }
  }

  const cannibalWith = page.primaryKeyword?.trim()
    ? (state.keywordOwners.get(foldKeyword(page.primaryKeyword)) ?? []).filter((p) => p !== page.path)
    : [];

  const crumbs = buildBreadcrumbs(page.path, page.breadcrumbLabel || page.name, state.graph);
  const nodes = buildJsonLd(
    {
      type: page.type, path: page.path, name: page.name, h1: page.h1 || page.name, description, faq,
      publishedAt: page.publishedAt, updatedAt: page.contentUpdatedAt, authorName: page.authorName,
      imageUrl: page.ogImage ? `${base}/medya/${page.ogImage.filename}` : null,
      serviceName: page.service?.name ?? null, provinceName: page.province?.name ?? null,
      districtName: page.district?.name ?? null, sectorName: page.sector?.name ?? null,
      disabled: page.schemaDisabled,
    },
    { base, site: settings.site, business: settings.business, logoUrl: settings.site.logoId ? "logo" : null, crumbs },
  );
  const schemaIssues = validateJsonLd(nodes);
  const schemaTypes = nodes.map((n) => String(n["@type"]));

  const minWords = (settings.seo.minWords as Record<string, number>)[page.type] ?? null;
  const input: AnalysisInput = {
    type: page.type,
    path: page.path,
    title,
    metaDescription: page.metaDescription,
    h1: page.h1 || "",
    intro: page.intro || "",
    bodyText: [md.text, faq.map((f) => `${f.q} ${f.a}`).join("\n")].join("\n"),
    headings: md.headings,
    bodyLinks: md.links.map((l) => ({ href: l.href, internal: isInternalHref(l.href, siteHost()) })),
    images: md.images,
    rawMarkdown: page.body || "",
    faqCount: faq.length,
    primaryKeyword: page.primaryKeyword,
    secondaryKeywords: page.secondaryKeywords,
    wouldBeIndexable: robots.index,
    noindexReasons: robots.reasons,
    selfCanonical,
    schemaTypes,
    schemaErrors: schemaIssues.filter((i) => i.level === "error").length,
    inlinks,
    navInlinks,
    outlinks,
    maxSimilarity: similar,
    duplicateThreshold: settings.seo.duplicateThreshold,
    cannibalWith,
    minWords,
    perf: state.perf.get(page.path) ?? null,
    hasOgImage: Boolean(page.ogImageId),
  };
  const seo = computeSeoScore(input);
  const autoNoindex = autoNoindexDecision(input, seo.wordCount);
  if (autoNoindex.noindex) {
    // Otomatik NOINDEX indekslenebilirlik kontrolüne yansır.
    const c = seo.checks.find((x) => x.id === "indexability");
    if (c && c.status === "PASS") {
      c.status = "FAIL";
      c.points = 0;
      c.message = `Sistem NOINDEX yapar: ${autoNoindex.reason}`;
      const cat = seo.categories.technical;
      cat.points -= c.max;
      const earned = seo.checks.reduce((s, x) => s + x.points, 0);
      const possible = seo.checks.filter((x) => x.status !== "NA").reduce((s, x) => s + x.max, 0);
      seo.score = applyCaps(Math.round((earned / possible) * 100), seo.checks);
    }
  }
  const quality = computeContentQuality(input, seo);
  const readiness = computeReadiness(input, seo);
  return {
    seo, quality, readiness, autoNoindex, title, description, inlinks, navInlinks, outlinks,
    similar, schemaTypes, schemaIssues, potentialInlinks,
  };
}

/** Tüm sayfaları analiz edip sonuçları kaydeder. */
export async function runFullAnalysis(): Promise<{ analyzed: number; autoNoindexChanged: number; state: SiteState }> {
  const state = await loadSiteState();
  let changed = 0;
  for (const page of state.pages) {
    // İçeriği tamamen boş taslaklarda (ör. henüz yazılmamış 900+ ilçe) analiz anlamsız.
    const empty = page.status === "DRAFT" && !page.body?.trim() && !page.intro?.trim();
    if (empty) {
      if (page.seoScore !== null)
        await db.page.update({ where: { id: page.id }, data: { seoScore: null, contentScore: null, analysis: Prisma.DbNull } });
      continue;
    }
    const a = analyzePage(page, state);
    const data: Prisma.PageUpdateInput = {
      seoScore: a.seo.score,
      contentScore: a.quality.score,
      analysis: JSON.parse(JSON.stringify(a)),
      analyzedAt: new Date(),
    };
    if (a.autoNoindex.noindex !== page.autoNoindex) {
      data.autoNoindex = a.autoNoindex.noindex;
      data.autoNoindexReason = a.autoNoindex.reason;
      changed++;
      await db.seoChangeLog.create({
        data: {
          pageId: page.id, path: page.path, field: "Otomatik NOINDEX",
          before: page.autoNoindex ? "Açık" : "Kapalı",
          after: a.autoNoindex.noindex ? `Açık — ${a.autoNoindex.reason}` : "Kapalı",
          userName: "Sistem",
        },
      });
    } else if (a.autoNoindex.noindex && a.autoNoindex.reason !== page.autoNoindexReason) {
      data.autoNoindexReason = a.autoNoindex.reason;
    }
    await db.page.update({ where: { id: page.id }, data });
  }
  return { analyzed: state.pages.length, autoNoindexChanged: changed, state };
}

export { navPaths };

/** Tek sayfayı güncel site durumuyla analiz edip kaydeder (editörde kayıt sonrası). */
export async function analyzeAndStore(pageId: string): Promise<PageAnalysis | null> {
  const state = await loadSiteState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const a = analyzePage(page, state);
  await db.page.update({
    where: { id: pageId },
    data: {
      seoScore: a.seo.score,
      contentScore: a.quality.score,
      analysis: JSON.parse(JSON.stringify(a)),
      analyzedAt: new Date(),
      autoNoindex: a.autoNoindex.noindex,
      autoNoindexReason: a.autoNoindex.reason,
    },
  });
  if (a.autoNoindex.noindex !== page.autoNoindex) {
    await db.seoChangeLog.create({
      data: {
        pageId, path: page.path, field: "Otomatik NOINDEX", before: page.autoNoindex ? "Açık" : "Kapalı",
        after: a.autoNoindex.noindex ? `Açık — ${a.autoNoindex.reason}` : "Kapalı", userName: "Sistem",
      },
    });
  }
  return a;
}

/** Kaydedilmemiş düzenlemeyi analiz eder (veritabanına yazmaz). */
export async function analyzeUnsaved(pageId: string, patch: Partial<FullPage>): Promise<PageAnalysis | null> {
  const state = await loadSiteState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const draft = { ...page, ...patch } as FullPage;
  // Yol değiştiyse grafikte de yeni yol görünmeli
  if (patch.path && patch.path !== page.path) {
    state.graph = new SiteGraph(state.graph.nodes.map((n) => (n.path === page.path ? { ...n, path: patch.path! } : n)));
  }
  return analyzePage(draft, state);
}
