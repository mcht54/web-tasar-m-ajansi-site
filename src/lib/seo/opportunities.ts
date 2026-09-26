import "server-only";
// SEO Fırsat Motoru: "Bugün yapılması gereken SEO çalışmaları".
// Her kural gerçek veriye dayanır; verisi olmayan kural görev üretmez
// (ör. Search Console bağlı değilse CTR görevi yerine kurulum görevi çıkar).

import { db } from "../db";

import { gscConnected as isGscConnected } from "../gsc/sync";
import { type SiteState, analyzePage, loadSiteState } from "./analyzer";
import { type LinkPage, linkStats, orphans, suggestLinks } from "./links";
import { intentConflicts } from "./cannibalization";
import { type Level, computePriority, expectedCtr, severityFor } from "./priority";
import { extractMarkdown } from "../text/markdown";
import { ISSUE_LABELS } from "../crawler/parse";
import { locationDemand } from "./location-demand";
import { computeQuickWins } from "./quick-wins";

export type TaskDraft = {
  fingerprint: string;
  code: string;
  impact: Level;
  difficulty: Level;
  boost?: number;
  title: string;
  reason: string;
  solution: string;
  url?: string | null;
  pageId?: string | null;
  keywordId?: string | null;
  data?: Record<string, unknown>;
};

const fmt = (n: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(n);
const DAY = 86400_000;

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
}

export function toLinkPages(state: SiteState): LinkPage[] {
  return state.pages.map((p) => ({
    id: p.id,
    path: p.path,
    type: p.type,
    name: p.name,
    published: p.status === "PUBLISHED",
    primaryKeyword: p.primaryKeyword,
    provinceId: p.provinceId,
    serviceId: p.serviceId,
    sectorId: p.sectorId,
    text: [p.intro ?? "", extractMarkdown(p.body).text].join("\n"),
    importance: p.type === "HOME" ? 5 : p.type === "SERVICE" ? 4 : 2,
  }));
}

export async function collectTasks(state?: SiteState): Promise<TaskDraft[]> {
  const st = state ?? (await loadSiteState());
  const tasks: TaskDraft[] = [];
  const byPath = new Map(st.pages.map((p) => [p.path, p]));
  const published = st.pages.filter((p) => p.status === "PUBLISHED");
  const gscConnected = (await isGscConnected()) && Boolean(st.settings.integrations.gscProperty);

  // 0) Kurulum
  if (!gscConnected) {
    tasks.push({
      fingerprint: "setup:gsc", code: "SETUP_GSC", impact: 3, difficulty: 1,
      title: "Google Search Console'u bağlayın",
      reason: "Sıralama, tıklama, CTR ve indeks verisi olmadan fırsat motoru yalnızca site içi analizle çalışıyor.",
      solution: "Ayarlar > SEO Entegrasyonları'ndan servis hesabı JSON anahtarını ve mülk adresini girin; servis hesabının e-postasını Search Console'da mülke kullanıcı olarak ekleyin.",
    });
  }

  // 1) Yayındaki sayfaların analizi
  const missingMeta: string[] = [];
  for (const p of published) {
    if (!p.robotsIndex) continue; // bilinçli NOINDEX sayfalar
    const a = analyzePage(p, st);
    const check = (id: string) => a.seo.checks.find((c) => c.id === id);
    if (!p.metaDescription?.trim()) missingMeta.push(p.path);
    const len = check("length");
    if (len && (len.status === "FAIL" || len.status === "WARN") && p.type !== "STATIC" && p.type !== "BLOG_INDEX") {
      tasks.push({
        fingerprint: `thin:${p.id}`, code: "THIN_CONTENT", impact: len.status === "FAIL" ? 3 : 1, difficulty: 2, pageId: p.id, url: p.path,
        title: `${p.path} sayfasının içeriği zayıf`,
        reason: len.message,
        solution: "Kullanıcının bu sayfada sorabileceği soruları yanıtlayan bölümler ekleyin (süreç, fiyatı etkileyen etkenler, örnekler, SSS). Kelime sayısını şişirmek değil, bilgi eklemek hedef.",
      });
    }
    const title = check("title-length");
    if (title?.status === "FAIL") {
      tasks.push({
        fingerprint: `title:${p.id}`, code: "TITLE", impact: 3, difficulty: 1, pageId: p.id, url: p.path,
        title: `${p.path} title uzunluğu uygun değil`, reason: title.message,
        solution: "Title'ı 30–60 karakter arasında, ana kelimeyi başa yakın geçirecek şekilde yeniden yazın.",
      });
    }
    for (const id of ["kw-title", "kw-h1"] as const) {
      const c = check(id);
      if (c?.status === "FAIL")
        tasks.push({
          fingerprint: `${id}:${p.id}`, code: id === "kw-title" ? "KW_NOT_IN_TITLE" : "KW_NOT_IN_H1", impact: 2, difficulty: 1, pageId: p.id, url: p.path,
          title: `${p.path}: ana kelime ${id === "kw-title" ? "title" : "H1"}'de geçmiyor`,
          reason: `Ana kelime: “${p.primaryKeyword}”. ${c.message}.`,
          solution: `${id === "kw-title" ? "Title" : "H1"} içine ana kelimeyi doğal bir şekilde ekleyin.`,
        });
    }
    if (a.similar.score >= st.settings.seo.duplicateThreshold) {
      tasks.push({
        fingerprint: `dup:${p.id}`, code: "DUPLICATE", impact: 3, difficulty: 2, pageId: p.id, url: p.path,
        title: `${p.path} başka bir sayfayla neredeyse aynı`,
        reason: `${a.similar.path} ile %${Math.round(a.similar.score * 100)} benzer (şehir adları yok sayılarak).`,
        solution: "Sayfaya o konuma/sektöre özgü gerçek bilgi ekleyin veya iki sayfayı birleştirip eskisini 301 ile yönlendirin.",
      });
    }
    const schemaErrors = a.schemaIssues.filter((i) => i.level === "error");
    if (schemaErrors.length) {
      tasks.push({
        fingerprint: `schema:${p.id}`, code: "SCHEMA_ERROR", impact: 2, difficulty: 1, pageId: p.id, url: p.path,
        title: `${p.path} schema hatası`,
        reason: schemaErrors.map((i) => `${i.type}: ${i.message}`).join("; "),
        solution: "Schema ekranından üretilen JSON-LD'yi inceleyin; eksik alanı sayfa veya işletme ayarlarından tamamlayın.",
      });
    }
  }
  if (missingMeta.length) {
    tasks.push({
      fingerprint: "meta:missing", code: "MISSING_META", impact: 2, difficulty: 1, boost: Math.min(10, missingMeta.length),
      title: `${missingMeta.length} sayfanın meta description'ı eksik`,
      reason: `Açıklama elle yazılmadığı için giriş paragrafından otomatik türetiliyor: ${missingMeta.slice(0, 5).join(", ")}${missingMeta.length > 5 ? "…" : ""}`,
      solution: "Her sayfa için 110–160 karakterlik, tıklamaya davet eden özgün bir açıklama yazın.", data: { paths: missingMeta },
    });
  }

  // 2) Görsel ALT
  const mediaNoAlt = await db.media.count({ where: { OR: [{ alt: null }, { alt: "" }] } });
  const bodyNoAlt = published.reduce((s, p) => s + extractMarkdown(p.body).images.filter((i) => !i.alt.trim()).length, 0);
  if (mediaNoAlt + bodyNoAlt > 0) {
    tasks.push({
      fingerprint: "alt:missing", code: "IMG_ALT", impact: 1, difficulty: 1, boost: Math.min(10, mediaNoAlt + bodyNoAlt),
      title: `${mediaNoAlt + bodyNoAlt} görselde ALT bulunmuyor`,
      reason: `Medya kütüphanesinde ${mediaNoAlt}, sayfa içeriklerinde ${bodyNoAlt} görselin alternatif metni yok.`,
      solution: "Görselin gerçekte ne gösterdiğini anlatan kısa ALT metinleri yazın (anahtar kelime doldurmadan).",
    });
  }

  // 3) İç linkler
  const lp = toLinkPages(st);
  const stats = linkStats(lp, st.edges);
  const orph = orphans(stats).filter((s) => byPath.get(s.path)?.robotsIndex);
  if (orph.length) {
    tasks.push({
      fingerprint: "orphan:pages", code: "ORPHAN", impact: 3, difficulty: 1,
      title: `${orph.length} sayfada orphan page problemi var`,
      reason: `Bu sayfalara sitenin hiçbir yerinden link verilmiyor: ${orph.slice(0, 5).map((o) => o.path).join(", ")}`,
      solution: "Internal Linkler ekranındaki önerilere göre ilgili sayfalardan bağlamsal link verin.", data: { paths: orph.map((o) => o.path) },
    });
  }
  for (const s of stats) {
    const page = byPath.get(s.path);
    if (!page?.robotsIndex || ["HOME", "STATIC", "BLOG_INDEX"].includes(s.type)) continue;
    if (s.contextIn >= 2 || (s.contextIn === 0 && s.navIn === 0)) continue;
    const target = lp.find((x) => x.path === s.path)!;
    const sugg = suggestLinks(target, lp, st.edges, 3);
    if (!sugg.length) continue;
    tasks.push({
      fingerprint: `inlinks:${page.id}`, code: "LOW_INLINKS", impact: 2, difficulty: 1, pageId: page.id, url: s.path,
      title: `${s.path} sayfasına ${sugg.length} internal link eklenmeli`,
      reason: `Sayfa yalnızca ${s.contextIn} bağlamsal link alıyor${s.navIn ? ` (+${s.navIn} menü linki)` : ""}.`,
      solution: sugg.map((x) => `${x.source} → “${x.anchor}” (${x.reasons.join(", ")})`).join("\n"),
      data: { suggestions: sugg },
    });
  }

  // 4) Cannibalization (niyet)
  for (const c of intentConflicts(st.pages.filter((p) => p.status === "PUBLISHED" || p.body?.trim()))) {
    tasks.push({
      fingerprint: `cannibal-intent:${c.keyword}`, code: "CANNIBAL_INTENT", impact: 3, difficulty: 2, url: c.paths[0],
      title: `CANNIBALIZATION RİSKİ: “${c.keyword}” ${c.paths.length} sayfada hedefleniyor`,
      reason: `Aynı ana kelime: ${c.paths.join(", ")}`,
      solution: "Kelimeyi en uygun tek sayfaya bırakın; diğer sayfaların ana kelimesini alt niyete göre değiştirin (ör. ilçe sayfası için “web tasarım adapazarı”) veya sayfaları birleştirin.",
    });
  }

  // 5) Anahtar kelimeler ve Search Console
  const keywords = await db.keyword.findMany({ where: { status: "ACTIVE" }, include: { targetPage: { select: { path: true } } } });
  const byTarget = new Map<string, typeof keywords>();
  for (const k of keywords) if (k.targetPageId) byTarget.set(k.targetPageId, [...(byTarget.get(k.targetPageId) ?? []), k]);
  for (const [pageId, list] of byTarget) {
    const intents = new Set(list.map((k) => k.intent));
    if (list.length >= 4 && intents.size >= 2) {
      const p = st.pages.find((x) => x.id === pageId);
      tasks.push({
        fingerprint: `kw-many:${pageId}`, code: "MANY_KEYWORDS_ONE_URL", impact: 2, difficulty: 2, pageId, url: p?.path,
        title: `${list.length} keyword aynı URL'ye hedeflenmiş`,
        reason: `${p?.path}: ${list.map((k) => k.phrase).join(", ")} — ${intents.size} farklı arama niyeti.`,
        solution: "Farklı niyetteki kelimeler için ayrı sayfa planlayın ya da hedefleri daha uygun sayfalara taşıyın.",
      });
    }
  }

  if (gscConnected) {
    const since28 = new Date(Date.now() - 28 * DAY);
    for (const k of keywords) {
      const snaps = await db.rankSnapshot.findMany({ where: { keywordId: k.id, source: "GSC" }, orderBy: { date: "desc" }, take: 14 });
      if (!snaps.length) continue;
      const recent = snaps.slice(0, 3).filter((s) => s.position != null);
      const older = snaps.slice(7, 10).filter((s) => s.position != null);
      const avg = (l: typeof snaps) => l.reduce((s, x) => s + x.position!, 0) / l.length;
      const impressions = snaps.reduce((s, x) => s + x.impressions, 0);
      if (recent.length && older.length && avg(recent) - avg(older) >= 3) {
        tasks.push({
          fingerprint: `kw-drop:${k.id}`, code: "KEYWORD_DROP", impact: 3, difficulty: 2, boost: k.priority, keywordId: k.id, pageId: k.targetPageId, url: k.targetPage?.path,
          title: `“${k.phrase}” 7 gündür düşüşte (${fmt(avg(older), 1)} → ${fmt(avg(recent), 1)})`,
          reason: "Son 3 günün ortalama pozisyonu, 7–10 gün öncesine göre 3 sıradan fazla geriledi.",
          solution: "Sıralanan URL'nin değişip değişmediğini (cannibalization), sayfada son yapılan değişiklikleri (SEO logu) ve rakip sonuçları kontrol edin.",
        });
      }
      const pos = k.currentPosition;
      if (pos != null && pos >= 4 && pos <= 15 && impressions >= 20) {
        const target = Math.max(1, Math.floor(pos) - 3);
        const page = k.targetPageId ? st.pages.find((p) => p.id === k.targetPageId) : undefined;
        const a = page ? analyzePage(page, st) : null;
        const fixes = a ? a.seo.checks.filter((c) => c.status === "FAIL" || c.status === "WARN").slice(0, 3).map((c) => c.label) : [];
        tasks.push({
          fingerprint: `kw-win:${k.id}`, code: "KEYWORD_QUICK_WIN", impact: 3, difficulty: pos <= 10 ? 1 : 2, boost: k.priority * 2,
          keywordId: k.id, pageId: k.targetPageId, url: k.serpUrl ? pathOf(k.serpUrl) : page?.path,
          title: `“${k.phrase}” ${fmt(pos, 0)} → ${target} hedeflenebilir (garanti değil)`,
          reason: `Son 14 günde ${fmt(impressions)} gösterim; ilk sayfanın ${pos <= 10 ? "alt sıralarında" : "hemen dışında"}.`,
          solution: [
            fixes.length ? `Sayfadaki açık sorunlar: ${fixes.join(", ")}.` : "",
            "İçeriği bu sorgunun niyetine göre genişletin, ilgili sayfalardan bu kelimeyle bağlamsal link verin, title'ı tıklamaya daha davetkâr yazın.",
          ].filter(Boolean).join(" "),
        });
      }
    }

    // Lokasyon talebi: il/ilçeden arama var ama sayfa yok/taslak/NOINDEX/zayıf
    const demand = await locationDemand(90);
    for (const r of demand.rows.filter((x) => x.verdict !== "YAYINDA" && x.impressions >= 10).slice(0, 30)) {
      const what = { YOK: "sayfası yok", TASLAK: "sayfası taslak", NOINDEX: "sayfası NOINDEX", ZAYIF: "sayfası zayıf (SEO<80)" }[r.verdict as "YOK" | "TASLAK" | "NOINDEX" | "ZAYIF"];
      tasks.push({
        fingerprint: `loc-demand:${r.path}`, code: "LOCATION_DEMAND", impact: r.impressions >= 100 ? 3 : 2, difficulty: r.verdict === "ZAYIF" ? 1 : 2,
        boost: Math.min(10, Math.round(Math.log10(r.impressions + 1) * 3)), pageId: r.page?.id, url: r.path,
        title: `${r.name}'dan web tasarım aranıyor, ${what}`,
        reason: `Son 90 gün: ${fmt(r.impressions)} gösterim, ${fmt(r.clicks)} tıklama${r.position ? `, ort. poz. ${fmt(r.position, 1)}` : ""}. Örnek: ${r.queries.slice(0, 3).map((q) => `“${q.query}”`).join(", ")}`,
        solution: r.verdict === "ZAYIF"
          ? "Sayfanın analizindeki başarısız kontrolleri giderin ve bu sorguları anahtar kelime takibine alın."
          : "Lokasyon ekranındaki brief ile (veya AI taslağıyla) o konuma özgü gerçek bilgilerle içerik yazın; hazırlık kontrolü geçince yayınlayın.",
      });
    }

    // Düşük CTR: pozisyona göre beklenenin yarısından az
    const pageRows = await db.gscPageDaily.findMany({
      where: { date: { gte: since28 } }, select: { page: true, clicks: true, impressions: true, position: true },
    });
    const agg = new Map<string, { c: number; i: number; p: number }>();
    for (const r of pageRows) {
      const e = agg.get(r.page) ?? { c: 0, i: 0, p: 0 };
      e.c += r.clicks;
      e.i += r.impressions;
      e.p += r.position * r.impressions;
      agg.set(r.page, e);
    }
    const siteCtr = (() => {
      let c = 0, i = 0;
      for (const e of agg.values()) { c += e.c; i += e.i; }
      return i ? c / i : null;
    })();
    for (const [url, e] of agg) {
      if (e.i < 200) continue;
      const pos = e.p / e.i;
      const ctr = e.c / e.i;
      const exp = expectedCtr(pos);
      if (pos <= 10 && ctr < exp * 0.5) {
        const path = pathOf(url);
        tasks.push({
          fingerprint: `ctr:${path}`, code: "LOW_CTR", impact: 3, difficulty: 1, pageId: byPath.get(path)?.id, url: path,
          title: `${path} sayfasının CTR'si düşük`,
          reason: `Son 28 gün: ortalama pozisyon ${fmt(pos, 1)}, CTR %${fmt(ctr * 100, 1)} (bu pozisyon için beklenen yaklaşık %${fmt(exp * 100, 1)}${siteCtr != null ? `; site ortalaması %${fmt(siteCtr * 100, 1)}` : ""}).`,
          solution: "Title ve meta description'ı arama niyetine göre yeniden yazın: net fayda, bölge/hizmet bilgisi ve eylem çağrısı. 2–3 hafta sonra CTR'yi yeniden kontrol edin.",
        });
      }
    }

    // Hızlı kazanımlar: Search Console'daki tüm sorgular (takip edilen kelimelerle sınırlı değil)
    const qw = await computeQuickWins();
    const perCategory: Record<string, number> = {};
    const pagePath = (url: string | null) => (url ? pathOf(url) : null);
    for (const it of qw.items) {
      perCategory[it.category] = (perCategory[it.category] ?? 0) + 1;
      if (perCategory[it.category] > 15) continue; // kategori başına en güçlü 15
      const path = pagePath(it.page);
      const pageId = path ? byPath.get(path)?.id : undefined;
      const where = it.location ? ` (${it.location.name})` : "";
      const common = { url: path, pageId, data: { query: it.query, category: it.category, impressions: it.impressions, clicks: it.clicks, position: it.position, score: it.score, pages: it.pages } };
      const boost = Math.round((it.score - 50) / 5);
      switch (it.category) {
        case "FIRST_PAGE":
          tasks.push({ ...common, fingerprint: `qw:first:${it.query}`, code: "QW_FIRST_PAGE", impact: 3, difficulty: 1, boost,
            title: `İlk sayfa fırsatı: “${it.query}”${where} — ort. poz. ${fmt(it.position ?? 0, 1)}, ${fmt(it.impressions)} gösterim`,
            reason: it.reason, solution: "ÇÖZÜM ÖNER ile sayfanın mevcut title/meta/H1'ini ve içerik eksiklerini bu sorguya göre inceleyin; ilgili sayfalardan bu konuda bağlamsal link verin." });
          break;
        case "CONTENT":
          if ((it.position ?? 0) <= 10) break; // 8–10 aralığı zaten ilk sayfa fırsatı
          tasks.push({ ...common, fingerprint: `qw:content:${it.query}`, code: "QW_CONTENT", impact: 2, difficulty: 2, boost,
            title: `İçerik geliştirme fırsatı: “${it.query}”${where} — ort. poz. ${fmt(it.position ?? 0, 1)}`,
            reason: it.reason, solution: "Sorgunun niyetini karşılayan bir bölüm (H2), örnek ve SSS ekleyin; ÇÖZÜM ÖNER içerik eksiklerini listeler." });
          break;
        case "CTR":
          tasks.push({ ...common, fingerprint: `qw:ctr:${it.query}`, code: "QW_CTR", impact: 3, difficulty: 1, boost,
            title: `Title / Meta CTR fırsatı: “${it.query}”${where} — CTR %${fmt((it.ctr ?? 0) * 100, 1)}`,
            reason: it.reason, solution: "Title ve meta description'ı bu sorgunun niyetine göre yeniden yazın (fayda + konum + eylem). 2–3 hafta sonra CTR'yi karşılaştırın." });
          break;
        case "DECLINE":
          tasks.push({ ...common, fingerprint: `qw:decline:${it.query}`, code: "QW_DECLINE", impact: 3, difficulty: 2, boost,
            title: `Performans düşüşü: “${it.query}”${where} — tıklama ${fmt(it.prevClicks)} → ${fmt(it.clicks)}`,
            reason: it.reason, solution: "SEO değişiklik logundan bu dönemde sayfada ne değiştiğini, sıralanan URL'nin değişip değişmediğini (cannibalization) ve indeks durumunu kontrol edin." });
          break;
        case "RISING":
          tasks.push({ ...common, fingerprint: `qw:rising:${it.query}`, code: "QW_RISING", impact: 2, difficulty: 1, boost,
            title: `Yükselen sorgu: “${it.query}”${where} — ${fmt(it.impressions)} gösterim`,
            reason: it.reason, solution: "Sorguyu anahtar kelime takibine alın; sıralanan sayfada bu sorguya doğrudan yanıt veren bir bölüm yoksa ekleyin." });
          break;
        case "CANNIBAL":
          tasks.push({ ...common, fingerprint: `cannibal-serp:${it.query}`, code: "CANNIBAL_SERP", impact: 3, difficulty: 2, boost,
            title: `Keyword cannibalization: “${it.query}” için ${it.pages.length} sayfa yarışıyor`,
            reason: it.reason, solution: "Sorgu için tek bir hedef sayfa belirleyin; diğer sayfalardan hedef sayfaya bu kelimeyle link verin ve diğer sayfaların odağını ayrıştırın." });
          break;
      }
    }

    // İndeks durumu
    for (const s of await db.gscIndexStatus.findMany({ where: { verdict: { not: "PASS" } } })) {
      const path = pathOf(s.url);
      const page = byPath.get(path);
      if (!page || page.status !== "PUBLISHED") continue;
      tasks.push({
        fingerprint: `index:${path}`, code: "NOT_INDEXED", impact: 3, difficulty: 2, pageId: page.id, url: path,
        title: `${path} Google'da indekslenmemiş`,
        reason: `Search Console durumu: ${s.coverageState ?? s.verdict ?? "bilinmiyor"}`,
        solution: "“Crawled - currently not indexed” genellikle içerik kalitesi/özgünlüğü sinyalidir: içeriği güçlendirin ve iç link verin. “Discovered - currently not indexed” için iç linkleri artırın.",
      });
    }
  }

  // 6) Tarama sorunları (son tarama)
  const lastCrawl = await db.crawlRun.findFirst({ where: { status: "ok" }, orderBy: { startedAt: "desc" } });
  if (lastCrawl) {
    const grouped = await db.crawlIssue.groupBy({
      by: ["code", "severity"], where: { runId: lastCrawl.id, severity: { in: ["CRITICAL", "HIGH"] } }, _count: true,
    });
    for (const g of grouped) {
      const sample = await db.crawlIssue.findMany({ where: { runId: lastCrawl.id, code: g.code }, take: 5, select: { url: true, message: true } });
      tasks.push({
        fingerprint: `crawl:${g.code}`, code: `CRAWL_${g.code}`, impact: g.severity === "CRITICAL" ? 3 : 2, difficulty: 1, boost: Math.min(10, g._count),
        url: sample[0] ? pathOf(sample[0].url) : null,
        title: `${ISSUE_LABELS[g.code] ?? g.code}: ${g._count} sorun`,
        reason: sample.map((s) => `${pathOf(s.url)} — ${s.message}`).join("\n"),
        solution: "SEO Sağlığı ekranında sorunlu URL'lerin tam listesini inceleyin ve düzeltin; ardından yeniden tarayın.",
      });
    }
  } else {
    tasks.push({
      fingerprint: "setup:crawl", code: "SETUP_CRAWL", impact: 2, difficulty: 1,
      title: "Siteyi ilk kez tarayın", reason: "Henüz tamamlanmış bir SEO taraması yok.",
      solution: "SEO Sağlığı ekranından taramayı başlatın veya günlük işi (npm run job -- daily) cron'a ekleyin.",
    });
  }

  // 7) Yayına hazır taslaklar
  for (const p of st.pages.filter((x) => x.status === "DRAFT" && x.body?.trim())) {
    const a = analyzePage(p, st);
    if (a.readiness.ready && !a.autoNoindex.noindex) {
      tasks.push({
        fingerprint: `ready:${p.id}`, code: "READY_TO_PUBLISH", impact: 2, difficulty: 1, pageId: p.id, url: p.path,
        title: `${p.path} yayına hazır`, reason: `Yayına hazırlık kontrolü geçti (SEO ${a.seo.score}).`,
        solution: "Son kez okuyup yayına alın; yayın sonrası Search Console'dan URL denetimi isteyebilirsiniz.",
      });
    }
  }
  return tasks;
}

/** Görevleri kaydeder; bu çalıştırmada artık üretilmeyen açık görevleri otomatik kapatır. */
export async function runOpportunities() {
  const drafts = await collectTasks();
  const now = new Date();
  const seen = new Set<string>();
  for (const t of drafts) {
    if (seen.has(t.fingerprint)) continue;
    seen.add(t.fingerprint);
    const priority = computePriority(t.impact, t.difficulty, t.boost ?? 0);
    const data = {
      code: t.code, severity: severityFor(priority), impact: t.impact, difficulty: t.difficulty, priority,
      title: t.title, reason: t.reason, solution: t.solution, url: t.url ?? null, pageId: t.pageId ?? null,
      keywordId: t.keywordId ?? null, data: (t.data ?? undefined) as object | undefined, lastSeenAt: now,
    };
    const existing = await db.seoTask.findUnique({ where: { fingerprint: t.fingerprint } });
    if (!existing) await db.seoTask.create({ data: { fingerprint: t.fingerprint, ...data } });
    else
      await db.seoTask.update({
        where: { id: existing.id },
        // Çözüldü sayılan görev sorun sürüyorsa yeniden açılır; yok sayılan kalır.
        data: { ...data, ...(existing.status === "DONE" ? { status: "OPEN" as const, resolvedAt: null } : {}) },
      });
  }
  const resolved = await db.seoTask.updateMany({
    where: { status: "OPEN", fingerprint: { notIn: [...seen] } },
    data: { status: "DONE", resolvedAt: now },
  });
  return {
    status: "ok" as const,
    message: `${seen.size} fırsat/görev güncel, ${resolved.count} görev sorun kalmadığı için kapatıldı`,
    stats: { open: seen.size, autoResolved: resolved.count },
  };
}
