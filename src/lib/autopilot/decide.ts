import "server-only";
// SEO karar motoru: "Bu hafta organik görünürlüğü geliştirmek için en değerli 10
// işlem nedir?" Aday işlemler yalnızca gerçek veriden üretilir, 0–100 skorlanır,
// risk sınıfı atanır. Veri olmayan skor bileşeni 0'dır ve işaretlenir.

import { db } from "../db";
import { loadSiteState, analyzePage, type SiteState } from "../seo/analyzer";
import { computeQuickWins, type QwItem } from "../seo/quick-wins";
import { locationDemand } from "../seo/location-demand";
import { clusterAudit, linkStats, suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { expectedCtr } from "../seo/priority";
import { learningStats } from "./learning";
import { siteUrl } from "../env";

export type ActionType = "TITLE" | "META" | "INTERNAL_LINK" | "BROKEN_LINK" | "CONTENT" | "LOCATION" | "TECH" | "NEW_PAGE"
  | "H1" | "KEYWORD" | "SECONDARY_KEYWORDS" | "EXCERPT" | "OG_IMAGE" | "ALT_TEXT" | "INTRO" | "FAQ";
export type Risk = "AUTO" | "CONTROLLED" | "HUMAN";

export const ACTION_LABELS: Record<ActionType, string> = {
  TITLE: "Title optimizasyonu", META: "Meta description", INTERNAL_LINK: "İç link", BROKEN_LINK: "Kırık link düzeltme",
  CONTENT: "İçerik geliştirme", LOCATION: "Lokasyon içeriği", TECH: "Teknik SEO", NEW_PAGE: "Yeni sayfa",
  H1: "Eksik H1", KEYWORD: "Eksik ana kelime", SECONDARY_KEYWORDS: "Eksik ikincil kelimeler", EXCERPT: "Eksik özet",
  OG_IMAGE: "Eksik OG görseli", ALT_TEXT: "Eksik görsel alt metni", INTRO: "Eksik giriş paragrafı", FAQ: "Eksik SSS",
};
export const RISK_LABELS: Record<Risk, string> = { AUTO: "Otomatik", CONTROLLED: "Kontrollü otomatik", HUMAN: "İnsan onayı" };

export type ScoreParts = {
  visibility: number; position: number; ctrGap: number; trend: number; relevance: number; intent: number;
  quality: number; tech: number; effort: number; learning: number; noData: boolean;
};

export type Candidate = {
  key: string;
  type: ActionType;
  risk: Risk;
  title: string;
  reason: string;
  pageId: string | null;
  pagePath: string | null;
  query: string | null;
  clusterId: string | null;
  score: number;
  parts: ScoreParts;
  payload: Record<string, unknown>;
  evidence?: string; // ölçülen/gözlenen kanıt (uydurma yok)
  recommendedAction?: string;
  expectedIntent?: string | null;
  extra?: Record<string, unknown>; // işleme özgü öneri verisi (ör. yeni sayfa kümesi)
};

export const RECOMMENDED_ACTION: Record<ActionType, string> = {
  TITLE: "Title'ı odak sorguya ve arama niyetine göre yeniden yaz (30–60 karakter, sayfada olmayan iddia yok)",
  META: "Meta açıklamayı sayfanın kendi içeriğinden, aramayı yapan kişiye yanıt verecek şekilde yaz (110–160 karakter)",
  INTERNAL_LINK: "Kaynak sayfadan hedefe, hedefin konusunu adlandıran doğal anchor ile bağlamsal link ekle",
  BROKEN_LINK: "Kırık linki yönlendirmenin son hedefine çevir; hedef yoksa doğru sayfaya karar ver",
  CONTENT: "Sayfadaki doğrulanmış bilgilerle arama niyetini karşılayan tek bir bölüm ekle (en çok %40 büyüme)",
  LOCATION: "Gerçek talep varsa yerel sayfayı yalnızca doğrulanmış yerel bilgiyle hazırla; kalite kapısı + onayla yayınla",
  TECH: "Teknik sorunu incele ve düzelt (indeksleme/canonical/hedef sayfa kararı — insan onayı)",
  NEW_PAGE: "Aynı niyetteki sorguları tek sayfada karşıla: doğrulanmış bilgiyle taslak → kalite kapısı → yayın → sitemap → IndexNow",
  H1: "Sayfa adını H1 olarak kullan",
  KEYWORD: "H1'den ana anahtar kelimeyi tanımla",
  SECONDARY_KEYWORDS: "Search Console'da sayfanın göründüğü sorguları ikincil kelime olarak ekle",
  EXCERPT: "Sayfanın kendi girişinden kısa özet oluştur",
  OG_IMAGE: "Sayfadaki alt metinli kayıtlı görseli OG görseli yap",
  ALT_TEXT: "Alt metni boş görsellere Medya kaydındaki alt metni yaz",
  INTRO: "Sayfanın kendi bilgisiyle arama niyetine yanıt veren giriş paragrafı yaz (yapay zekâ)",
  FAQ: "Sayfadaki bilgilerle yanıtlanabilen 2–4 soru ekle (yapay zekâ)",
};

const LOCAL_PAGE_TYPES = new Set(["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"]);
const EFFORT: Record<Risk, number> = { AUTO: 1, CONTROLLED: 0.85, HUMAN: 0.7 };
const TYPE_RELEVANCE: Record<string, number> = { HOME: 8, SERVICE: 8, SECTOR: 6, CITY: 7, DISTRICT: 6, SERVICE_LOCATION: 7, SECTOR_LOCATION: 6, BLOG_POST: 5, BLOG_INDEX: 3, STATIC: 3 };

export function scoreCandidate(input: {
  impressions: number | null; position: number | null; ctr: number | null; trend: "rising" | "declining" | null;
  relevance: number; intent: string | null; seoScore: number | null; techIssue: boolean; risk: Risk; learning: number;
}): { score: number; parts: ScoreParts } {
  const noData = input.impressions == null;
  const parts: ScoreParts = {
    visibility: input.impressions != null ? Math.min(30, Math.log10(input.impressions + 1) * 10) : 0,
    position: input.position == null ? 0 : input.position >= 4 && input.position <= 10 ? 20 : input.position <= 20 && input.position > 10 ? 14 : input.position < 4 ? 6 : 4,
    ctrGap: input.position != null && input.ctr != null && input.position <= 10 ? Math.min(15, Math.max(0, (expectedCtr(input.position) - input.ctr) * 300)) : 0,
    trend: input.trend === "rising" ? 10 : input.trend === "declining" ? 8 : 0,
    relevance: Math.max(1, Math.min(10, input.relevance)),
    intent: input.intent && ["COMMERCIAL", "TRANSACTIONAL", "LOCAL"].includes(input.intent) ? 5 : input.intent ? 2 : 0,
    quality: input.seoScore != null ? Math.min(5, (100 - input.seoScore) / 20) : 0,
    tech: input.techIssue ? 5 : 0,
    effort: EFFORT[input.risk],
    learning: input.learning,
    noData,
  };
  const raw = parts.visibility + parts.position + parts.ctrGap + parts.trend + parts.relevance + parts.intent + parts.quality + parts.tech;
  return { score: Math.round(Math.min(100, raw * parts.effort * parts.learning)), parts };
}

export const SCORE_EXPLANATION =
  "Skor = görünürlük (gösterim, log, ≤30) + pozisyon potansiyeli (4–10 en yüksek, ≤20) + CTR açığı (≤15) + trend (≤10) + iş değeri (küme ağırlığı, ≤10) + niyet (≤5) + sayfa kalitesi açığı (≤5) + teknik sorun (5); sonra efor (otomatik ×1, kontrollü ×0,85, onay ×0,7) ve geçmiş sonuçlardan öğrenilen çarpan (0,7–1,3). Search Console verisi yoksa ilk dört bileşen 0'dır.";

export async function generateCandidates(state?: SiteState): Promise<{ candidates: Candidate[]; hasGsc: boolean }> {
  const st = state ?? (await loadSiteState());
  const [qw, demand, learn, clusters, keywords, lastCrawl, running, redirects] = await Promise.all([
    computeQuickWins(), locationDemand(90), learningStats(),
    db.keywordCluster.findMany(), db.keyword.findMany({ where: { status: "ACTIVE" }, select: { normalized: true, clusterId: true, intent: true } }),
    db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } }),
    db.experiment.findMany({ where: { status: "running" }, select: { pageId: true, type: true, appliedAt: true } }),
    db.redirect.findMany({ where: { active: true }, select: { fromPath: true, toPath: true } }),
  ]);
  const base = siteUrl();
  const byPath = new Map(st.pages.map((p) => [p.path, p]));
  const pathOf = (url: string | null) => (url && url.startsWith(base) ? url.slice(base.length).replace(/\/$/, "") || "/" : null);
  const kwInfo = new Map(keywords.map((k) => [k.normalized, k]));
  const clusterWeight = new Map(clusters.map((c) => [c.id, c.weight]));
  const lm = (t: ActionType) => learn.get(t)?.multiplier ?? 1;
  const cooling = (pageId: string, type: ActionType) => running.some((e) => e.pageId === pageId && e.type === type);
  const out: Candidate[] = [];
  const push = (c: Omit<Candidate, "score" | "parts"> & { m: Parameters<typeof scoreCandidate>[0] }) => {
    const { m, ...rest } = c;
    const s = scoreCandidate(m);
    out.push({
      ...rest, score: s.score, parts: s.parts,
      evidence: rest.evidence ?? rest.reason,
      recommendedAction: rest.recommendedAction ?? RECOMMENDED_ACTION[rest.type],
      expectedIntent: rest.expectedIntent ?? (rest.query ? kwInfo.get(rest.query)?.intent ?? null : m.intent ?? null),
    });
  };
  const trendOf = (q: string) => (qw.items.some((i) => i.query === q && i.category === "RISING") ? "rising" : qw.items.some((i) => i.query === q && i.category === "DECLINE") ? "declining" : null);
  const relevanceFor = (q: string | null, path: string | null) => {
    const k = q ? kwInfo.get(q) : null;
    if (k?.clusterId) return clusterWeight.get(k.clusterId) ?? 5;
    const p = path ? byPath.get(path) : null;
    return p ? TYPE_RELEVANCE[p.type] ?? 4 : 4;
  };

  // 1) Search Console fırsatları → title / meta / içerik
  const seenPageType = new Set<string>();
  const qwSorted: QwItem[] = [...qw.items].sort((a, b) => b.score - a.score);
  for (const it of qwSorted) {
    const path = pathOf(it.page);
    const page = path ? byPath.get(path) : null;
    if (!page || page.status !== "PUBLISHED") continue;
    const intent = kwInfo.get(it.query)?.intent ?? null;
    const m = { impressions: it.impressions, position: it.position, ctr: it.ctr, trend: trendOf(it.query), relevance: relevanceFor(it.query, path), intent, seoScore: page.seoScore, techIssue: false } as const;
    // Konumlu sorgu genel sayfanın title/meta'sına yazılmaz (yanıltıcı yerel iddia olur);
    // bu talep lokasyon fırsatı olarak insan onayına gider.
    const localMismatch = Boolean(it.location) && !LOCAL_PAGE_TYPES.has(page.type);
    if (!localMismatch && (it.category === "CTR" || it.category === "FIRST_PAGE") && !seenPageType.has(`${page.id}:TITLE`) && !cooling(page.id, "TITLE")) {
      seenPageType.add(`${page.id}:TITLE`);
      push({ key: `TITLE:${page.id}`, type: "TITLE", risk: "AUTO", pageId: page.id, pagePath: page.path, query: it.query, clusterId: kwInfo.get(it.query)?.clusterId ?? null,
        title: `${page.path} title optimizasyonu (“${it.query}”)`, reason: it.reason, payload: { category: it.category }, m: { ...m, risk: "AUTO", learning: lm("TITLE") } });
    }
    if (!localMismatch && (it.category === "CTR" || !page.metaDescription) && !seenPageType.has(`${page.id}:META`) && !cooling(page.id, "META")) {
      seenPageType.add(`${page.id}:META`);
      push({ key: `META:${page.id}`, type: "META", risk: "AUTO", pageId: page.id, pagePath: page.path, query: it.query, clusterId: kwInfo.get(it.query)?.clusterId ?? null,
        title: `${page.path} meta description (“${it.query}”)`, reason: page.metaDescription ? it.reason : `Meta description yok. ${it.reason}`, payload: {}, m: { ...m, risk: "AUTO", learning: lm("META") } });
    }
    if (it.category === "CONTENT" && !seenPageType.has(`${page.id}:CONTENT`) && !cooling(page.id, "CONTENT")) {
      seenPageType.add(`${page.id}:CONTENT`);
      push({ key: `CONTENT:${page.id}`, type: "CONTENT", risk: "CONTROLLED", pageId: page.id, pagePath: page.path, query: it.query, clusterId: kwInfo.get(it.query)?.clusterId ?? null,
        title: `${page.path} içerik kapsamı (“${it.query}”)`, reason: it.reason, payload: {}, m: { ...m, risk: "CONTROLLED", learning: lm("CONTENT") } });
    }
    if (it.category === "CANNIBAL" && !seenPageType.has(`CANNIBAL:${it.query}`)) {
      seenPageType.add(`CANNIBAL:${it.query}`);
      push({ key: `TECH:cannibal:${it.query}`, type: "TECH", risk: "HUMAN", pageId: page.id, pagePath: page.path, query: it.query, clusterId: null,
        title: `“${it.query}” için hedef sayfa kararı (cannibalization)`, reason: it.reason, payload: { pages: it.pages }, m: { ...m, risk: "HUMAN", learning: lm("TECH") } });
    }
  }

  // 2) Lokasyon talebi: sayfa yok/taslak → insan onayı; yayında ama zayıf → içerik
  for (const r of demand.rows.slice(0, 20)) {
    const m = { impressions: r.impressions, position: r.position, ctr: r.ctr, trend: null, relevance: 8, intent: "LOCAL", seoScore: r.page?.seoScore ?? null, techIssue: false } as const;
    if (r.verdict === "YOK" || r.verdict === "TASLAK" || r.verdict === "NOINDEX") {
      push({ key: `LOCATION:${r.path}`, type: "LOCATION", risk: "HUMAN", pageId: r.page?.id ?? null, pagePath: r.path, query: r.queries[0]?.query ?? null, clusterId: null,
        title: `${r.name} için yerel sayfa (${r.verdict === "YOK" ? "sayfa yok" : r.verdict === "TASLAK" ? "taslak" : "NOINDEX"})`,
        reason: `Son 90 gün ${r.impressions} gösterim, ${r.clicks} tıklama. Sorgular: ${r.queries.slice(0, 3).map((q) => q.query).join(", ")}. Yeni/yerel sayfa yayını insan onayı ve kalite kapısı gerektirir.`,
        payload: { name: r.name }, m: { ...m, risk: "HUMAN", learning: lm("LOCATION") } });
    }
  }

  // 3) İç linkler: zayıf/orphan hedefler ve küme eksikleri (kaynak yayındaki sayfa)
  const lp = toLinkPages(st);
  const stats = linkStats(lp, st.edges);
  const pageImpr = new Map<string, number>();
  for (const it of qw.items) {
    const p = pathOf(it.page);
    if (p) pageImpr.set(p, (pageImpr.get(p) ?? 0) + it.impressions);
  }
  const linkTargets = stats.filter((s) => !["HOME", "STATIC", "BLOG_INDEX"].includes(s.type) && (s.contextIn < 2 || (pageImpr.get(s.path) ?? 0) > 0));
  for (const t of linkTargets) {
    const target = lp.find((p) => p.path === t.path);
    const page = byPath.get(t.path);
    if (!target || !page || !page.robotsIndex || page.autoNoindex) continue;
    for (const sug of suggestLinks(target, lp, st.edges, 2)) {
      push({ key: `INTERNAL_LINK:${sug.source}->${sug.target}`, type: "INTERNAL_LINK", risk: "AUTO", pageId: byPath.get(sug.source)?.id ?? null, pagePath: sug.source, query: null, clusterId: null,
        title: `${sug.source} → ${sug.target} iç link`, reason: `${t.contextIn} bağlamsal gelen link. ${sug.reasons.join("; ")}.`,
        payload: { source: sug.source, target: sug.target, anchor: sug.anchor },
        m: { impressions: pageImpr.get(t.path) ?? (qw.hasData ? 0 : null), position: null, ctr: null, trend: null, relevance: TYPE_RELEVANCE[page.type] ?? 4, intent: null, seoScore: page.seoScore, techIssue: t.contextIn === 0, risk: "AUTO", learning: lm("INTERNAL_LINK") } });
    }
  }
  for (const c of clusterAudit(lp, st.edges).suggestions.filter((x) => x.relation !== "location-cluster").slice(0, 30)) {
    const page = byPath.get(c.target);
    if (!page || !page.robotsIndex || page.autoNoindex) continue;
    push({ key: `INTERNAL_LINK:${c.source}->${c.target}`, type: "INTERNAL_LINK", risk: "AUTO", pageId: byPath.get(c.source)?.id ?? null, pagePath: c.source, query: null, clusterId: null,
      title: `${c.source} → ${c.target} iç link (konu kümesi)`, reason: c.reason, payload: { source: c.source, target: c.target, anchor: c.anchor },
      m: { impressions: pageImpr.get(c.target) ?? (qw.hasData ? 0 : null), position: null, ctr: null, trend: null, relevance: TYPE_RELEVANCE[page.type] ?? 4, intent: null, seoScore: page.seoScore, techIssue: false, risk: "AUTO", learning: lm("INTERNAL_LINK") } });
  }

  // 4) Eksik meta (Search Console gerekmez) ve zayıf içerik
  for (const p of st.pages.filter((x) => x.status === "PUBLISHED" && x.robotsIndex && !x.metaDescription?.trim() && x.intro?.trim())) {
    if (seenPageType.has(`${p.id}:META`) || cooling(p.id, "META")) continue;
    push({ key: `META:${p.id}`, type: "META", risk: "AUTO", pageId: p.id, pagePath: p.path, query: null, clusterId: null,
      title: `${p.path} meta description eksik`, reason: "Meta description elle yazılmamış; giriş paragrafından otomatik türetiliyor.", payload: {},
      m: { impressions: null, position: null, ctr: null, trend: null, relevance: TYPE_RELEVANCE[p.type] ?? 4, intent: null, seoScore: p.seoScore, techIssue: true, risk: "AUTO", learning: lm("META") } });
  }
  for (const p of st.pages.filter((x) => x.status === "PUBLISHED" && x.robotsIndex && !["STATIC", "BLOG_INDEX", "HOME"].includes(x.type))) {
    if (seenPageType.has(`${p.id}:CONTENT`) || cooling(p.id, "CONTENT")) continue;
    const a = analyzePage(p, st);
    const len = a.seo.checks.find((c) => c.id === "length");
    if (len?.status !== "FAIL" && len?.status !== "WARN") continue;
    push({ key: `CONTENT:${p.id}`, type: "CONTENT", risk: "CONTROLLED", pageId: p.id, pagePath: p.path, query: null, clusterId: null,
      title: `${p.path} içerik kapsamı`, reason: len.message, payload: {},
      m: { impressions: pageImpr.get(p.path) ?? (qw.hasData ? 0 : null), position: null, ctr: null, trend: null, relevance: TYPE_RELEVANCE[p.type] ?? 4, intent: null, seoScore: p.seoScore, techIssue: false, risk: "CONTROLLED", learning: lm("CONTENT") } });
  }

  // 5) Teknik: kırık iç link (yönlendirmesi varsa otomatik), indekslenmeyen sayfa (onay)
  if (lastCrawl) {
    const broken = await db.crawlIssue.findMany({ where: { runId: lastCrawl.id, code: "BROKEN_INTERNAL_LINK" } });
    for (const b of broken) {
      const src = pathOf(b.url) ?? new URL(b.url).pathname;
      const target = String((b.detail as { target?: string } | null)?.target ?? "");
      const targetPath = target ? new URL(target).pathname.replace(/\/$/, "") || "/" : "";
      const redirect = redirects.find((r) => r.fromPath === targetPath);
      const page = byPath.get(src);
      push({ key: `BROKEN_LINK:${src}->${targetPath}`, type: "BROKEN_LINK", risk: redirect ? "AUTO" : "HUMAN", pageId: page?.id ?? null, pagePath: src, query: null, clusterId: null,
        title: `${src} sayfasında kırık link: ${targetPath}`, reason: redirect ? `Hedef ${redirect.toPath} adresine yönleniyor; link doğrudan yeni adrese çevrilebilir.` : "Hedef adres 404; doğru hedefe karar verilmeli.",
        payload: { from: targetPath, to: redirect?.toPath ?? null },
        m: { impressions: null, position: null, ctr: null, trend: null, relevance: 6, intent: null, seoScore: page?.seoScore ?? null, techIssue: true, risk: redirect ? "AUTO" : "HUMAN", learning: lm("BROKEN_LINK") } });
    }
  }
  for (const s of await db.gscIndexStatus.findMany({ where: { verdict: { not: "PASS" } } })) {
    const path = pathOf(s.url);
    const page = path ? byPath.get(path) : null;
    if (!page || page.status !== "PUBLISHED") continue;
    push({ key: `TECH:index:${path}`, type: "TECH", risk: "HUMAN", pageId: page.id, pagePath: path, query: null, clusterId: null,
      title: `${path} Google'da indekslenmemiş`, reason: `Search Console: ${s.coverageState ?? s.verdict}`, payload: {},
      m: { impressions: pageImpr.get(path!) ?? null, position: null, ctr: null, trend: null, relevance: TYPE_RELEVANCE[page.type] ?? 4, intent: null, seoScore: page.seoScore, techIssue: true, risk: "HUMAN", learning: lm("TECH") } });
  }

  // Aynı anahtar bir kez; skor sırası
  const uniq = new Map<string, Candidate>();
  for (const c of out) if (!uniq.has(c.key) || uniq.get(c.key)!.score < c.score) uniq.set(c.key, c);
  return { candidates: [...uniq.values()].sort((a, b) => b.score - a.score), hasGsc: qw.hasData };
}

/** Haftanın en değerli 10 işlemi: sayfa başına tek türde bir işlem, iç linkte sayfa başına en çok 3. */
export function selectTop(candidates: Candidate[], n = 10): Candidate[] {
  const picked: Candidate[] = [];
  const perSource = new Map<string, number>();
  for (const c of candidates) {
    if (picked.length >= n) break;
    if (c.type === "INTERNAL_LINK") {
      const k = c.pagePath ?? "";
      if ((perSource.get(k) ?? 0) >= 3) continue;
      perSource.set(k, (perSource.get(k) ?? 0) + 1);
    } else if (picked.some((p) => p.type === c.type && p.pageId && p.pageId === c.pageId)) continue;
    picked.push(c);
  }
  return picked;
}
