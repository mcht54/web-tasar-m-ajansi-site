import "server-only";
// RAKİP → FARK → FIRSAT. Rakip verisi yalnızca SİNYALDİR: karar, mevcut motorlardan
// (Faz 3 hizmet kararı, içerik kalite kapıları, Faz 2 risk sistemi) geçer. Rakip metni
// kopyalanmaz; yalnızca yapı/konu sinyalleri (sayfa türü, H2 sayısı ve başlık konuları,
// schema türleri, link sayıları) kullanılır. Trafik, backlink, gerçek sıralama, müşteri
// sayısı gibi elimizde olmayan veri asla tahmin edilmez (UNKNOWN).

import { db } from "../db";
import { gscConnected } from "../gsc/sync";
import { analyzePage, loadSiteState } from "../seo/analyzer";
import { linkStats, suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { matchTopic } from "../autopilot/clusters";
import { extractMarkdown } from "../text/markdown";
import { serviceOpportunities, SERVICE_DECISION_LABELS, type ServiceDecision } from "../content/opportunities";
import { SERVICE_CATALOG } from "../content/catalog";
import { CATEGORY_LABELS, type Category } from "./classify";

export type Quality = "VERIFIED" | "INFERRED" | "UNKNOWN";
export const QUALITY_LABELS: Record<Quality, string> = { VERIFIED: "Doğrulandı (gözlendi)", INFERRED: "Çıkarım (sınıflandırma)", UNKNOWN: "Bilinmiyor (veri yok)" };
/** Elimizde olmayan ve asla tahmin edilmeyen rakip verileri. */
export const UNKNOWN_METRICS = ["Organik trafik", "Backlink profili", "Gerçek Google sıralaması", "Müşteri sayısı", "Gelir", "Dönüşüm oranı", "Reklam bütçesi"];

export type FindingType = "CONTENT_EXPANSION" | "CONTENT_GAP" | "SERVICE_GAP" | "TECHNICAL_GAP" | "INTERNAL_LINK_GAP" | "LOCAL_GAP";
export const FINDING_LABELS: Record<FindingType, string> = {
  CONTENT_EXPANSION: "İçerik genişletme", CONTENT_GAP: "İçerik boşluğu", SERVICE_GAP: "Hizmet boşluğu",
  TECHNICAL_GAP: "Teknik fark", INTERNAL_LINK_GAP: "İç link farkı", LOCAL_GAP: "Lokasyon kapsamı",
};
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export const PRIORITY_LABELS: Record<Priority, string> = { URGENT: "Acil", HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" };

export type Signals = {
  gscDemand: number | null; // null = Search Console bağlı değil
  keywordDemand: number;
  commercialIntent: string;
  existingPageFit: string | null;
  contentGap: string | null;
  technicalGap: string | null;
  serviceVerification: boolean | null;
  cannibalizationRisk: string | null;
  implementationRisk: "LOW" | "MEDIUM" | "HIGH";
};

export type Finding = {
  key: string;
  type: FindingType;
  title: string;
  theirs: string; // "Rakipte var"
  ours: string; // "Bizde"
  why: string; // "Neden önemli"
  evidence: { text: string; quality: Quality }[];
  action: string;
  actionable: boolean;
  blockedReason: string | null;
  signals: Signals;
  priority: Priority;
  priorityReason: string;
  competitors: string[];
  proposal?: { kind: "CONTENT" | "NEW_PAGE" | "META" | "INTERNAL_LINK"; key: string; pageId: string | null; path: string; payload?: Record<string, unknown>; competitorHeadings?: string[]; decision?: ServiceDecision };
};

type CPage = Awaited<ReturnType<typeof db.competitorPage.findMany>>[number] & { domain: string };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

function priorityOf(s: Signals, actionable: boolean): { priority: Priority; reason: string } {
  const demand = (s.gscDemand ?? 0) + s.keywordDemand;
  const commercial = ["COMMERCIAL", "TRANSACTIONAL"].includes(s.commercialIntent);
  if (actionable && s.technicalGap && s.existingPageFit && commercial) return { priority: "URGENT", reason: "Ticari sayfada doğrudan düzeltilebilir teknik eksik" };
  if (actionable && demand > 0 && commercial) return { priority: "HIGH", reason: "Uygulanabilir; ölçülen talep sinyali var ve ticari niyet" };
  if (actionable) return { priority: "MEDIUM", reason: demand ? "Uygulanabilir; talep var" : "Uygulanabilir; ölçülen talep sinyali yok" };
  return { priority: "LOW", reason: "Bilgi amaçlı: şu an uygulanabilir değil" };
}

export async function competitorFindings(opts: { competitorId?: string } = {}) {
  const competitors = await db.competitor.findMany({ where: { status: { not: "paused" }, ...(opts.competitorId ? { id: opts.competitorId } : {}) }, select: { id: true, domain: true } });
  const pages: CPage[] = (await db.competitorPage.findMany({ where: { competitorId: { in: competitors.map((c) => c.id) }, status: 200, removedAt: null } }))
    .map((p) => ({ ...p, domain: competitors.find((c) => c.id === p.competitorId)!.domain }));
  const [hasGsc, st, services] = await Promise.all([gscConnected(), loadSiteState(), serviceOpportunities()]);
  const ours = st.pages.filter((p) => p.status === "PUBLISHED");
  const analysis = new Map(ours.map((p) => [p.id, analyzePage(p, st)]));
  const findings: Finding[] = [];
  if (!pages.length) return { findings, hasGsc, competitors, pages: 0 };
  const byTopic = (t: string) => pages.filter((p) => p.topics.includes(t));

  // 1) Hizmet konuları: rakipte var → bizde durum (Faz 3 hizmet kararı aynen)
  for (const def of SERVICE_CATALOG) {
    const theirs = byTopic(def.path).filter((p) => p.category !== "home");
    if (!theirs.length) continue;
    const d = services.rows.find((r) => r.path === def.path)!;
    const doms = [...new Set(theirs.map((p) => p.domain))];
    const evidence = [
      ...theirs.slice(0, 4).map((p) => ({ text: `${p.domain}${p.path} — ${p.h2.length} H2, ${p.wordCount} kelime`, quality: "VERIFIED" as Quality })),
      { text: `Konu eşleşmesi URL/title/H1 kalıplarından: “${def.name}”`, quality: "INFERRED" as Quality },
    ];
    const signalsBase = { gscDemand: hasGsc ? d.gscImpressions ?? 0 : null, keywordDemand: d.trackedKeywords, commercialIntent: "COMMERCIAL", serviceVerification: d.decision === "UNVERIFIED" ? false : d.decision === "COVERED" || d.decision === "EXPAND_EXISTING" ? true : d.decision === "NO_DEMAND_SIGNAL" || d.decision === "NEW_SERVICE_PAGE" ? true : null };
    const targetPath = d.decision === "COVERED" ? d.coveredBy : d.decision === "EXPAND_EXISTING" ? d.coveredBy : null;
    const target = targetPath ? ours.find((p) => p.path === targetPath) : null;
    if (target) {
      // Mevcut sayfa: kapsam karşılaştırması (yalnızca yapı: H2 sayısı ve kelime sayısı)
      const a = analysis.get(target.id)!;
      const ourH2 = extractMarkdown(target.body).headings.filter((h) => h.depth === 2).length;
      const theirH2 = median(theirs.map((p) => p.h2.length));
      const theirWords = median(theirs.map((p) => p.wordCount));
      const thin = a.seo.wordCount < theirWords * 0.6 || ourH2 + 2 < theirH2;
      const theirHeads = [...new Set(theirs.flatMap((p) => p.h2))].slice(0, 20);
      if (!thin && d.decision === "COVERED") continue;
      const gap = `Bizim sayfa ${a.seo.wordCount} kelime / ${ourH2} H2; rakiplerde ortanca ${theirWords} kelime / ${theirH2} H2`;
      const s: Signals = { ...signalsBase, existingPageFit: target.path, contentGap: gap, technicalGap: null, cannibalizationRisk: null, implementationRisk: "MEDIUM" };
      const p = priorityOf(s, true);
      findings.push({
        key: `CONTENT_EXPANSION:${def.path}`, type: "CONTENT_EXPANSION", title: `${target.path} — “${def.name}” kapsamı`,
        theirs: `${doms.length} rakipte bu konuya ayrılmış sayfa (${theirs.length})`, ours: `${target.path} mevcut; ${d.decision === "EXPAND_EXISTING" ? "konu bu sayfanın kapsamında" : "kapsamı daha dar"}`,
        why: "Yeni URL açmak yerine mevcut sayfa genişletilir (cannibalization yok). Konu listesi yalnızca kapsam sinyalidir; metin kopyalanmaz.",
        evidence: [...evidence, { text: gap, quality: "VERIFIED" }], action: "Mevcut sayfaya kalite kapısından geçen tek bir yeni bölüm (48 saat onay)",
        actionable: true, blockedReason: null, signals: s, ...p, priorityReason: p.reason, competitors: doms,
        proposal: { kind: "CONTENT", key: `CONTENT:${target.id}`, pageId: target.id, path: target.path, competitorHeadings: theirHeads },
      });
      continue;
    }
    const actionable = d.decision === "NEW_SERVICE_PAGE";
    const s: Signals = { ...signalsBase, existingPageFit: null, contentGap: `Sitede “${def.name}” konulu sayfa yok`, technicalGap: null, cannibalizationRisk: null, implementationRisk: "MEDIUM" };
    const p = priorityOf(s, actionable);
    findings.push({
      key: `SERVICE_GAP:${def.path}`, type: "SERVICE_GAP", title: `“${def.name}” hizmet konusu`,
      theirs: `${doms.length} rakipte “${def.name}” sayfası keşfedildi`, ours: "Sitenizde eşleşen konu bulunamadı",
      why: "Rakipte olması tek başına sayfa açma nedeni değildir: hizmetin verildiği doğrulanmalı ve ölçülen talep olmalı.",
      evidence, action: actionable ? "Yeni hizmet sayfası önerisi (taslak + kalite kapısı + 48 saat onay)" : "Uygulanmaz",
      actionable, blockedReason: actionable ? null : `${SERVICE_DECISION_LABELS[d.decision]}: ${d.reason}`, signals: s, ...p, priorityReason: p.reason, competitors: doms,
      ...(actionable ? { proposal: { kind: "NEW_PAGE" as const, key: `NEW_PAGE:service:${def.path}`, pageId: null, path: def.path, decision: d } } : {}),
    });
  }

  // 2) İçerik boşluğu (blog/rehber konuları): yalnızca bilgi; yeni rehber kararı gerçek sorgu kümesiyle verilir
  const ourTopics = new Set(ours.map((p) => matchTopic(`${p.primaryKeyword ?? ""} ${p.h1 ?? p.name}`)?.key).filter(Boolean));
  const blogTopics = new Map<string, CPage[]>();
  for (const p of pages.filter((x) => x.category === "blog")) {
    const t = matchTopic(`${p.title ?? ""} ${p.h1[0] ?? ""}`);
    if (t && !ourTopics.has(t.key)) blogTopics.set(t.key, [...(blogTopics.get(t.key) ?? []), p]);
  }
  for (const [key, list] of blogTopics) {
    const name = matchTopic(`${list[0].title ?? ""} ${list[0].h1[0] ?? ""}`)!.name;
    const s: Signals = { gscDemand: hasGsc ? 0 : null, keywordDemand: 0, commercialIntent: "INFORMATIONAL", existingPageFit: null, contentGap: `Rakip rehberlerinde “${name}” konusu; sitede eşleşen konu yok`, technicalGap: null, serviceVerification: null, cannibalizationRisk: null, implementationRisk: "MEDIUM" };
    const p = priorityOf(s, false);
    findings.push({
      key: `CONTENT_GAP:${key}`, type: "CONTENT_GAP", title: `Rehber konusu: ${name}`,
      theirs: `${list.length} rehber/blog sayfası (${[...new Set(list.map((x) => x.domain))].join(", ")})`, ours: "Sitenizde eşleşen konu bulunamadı",
      why: "Yeni rehber yalnızca Search Console'daki gerçek sorgu kümesiyle açılır (otopilot sayfa karar motoru); rakipte olması yeterli değildir.",
      evidence: list.slice(0, 4).map((x) => ({ text: `${x.domain}${x.path}`, quality: "VERIFIED" as Quality })), action: "Talep oluşursa otopilot yeni sayfa kararı verir",
      actionable: false, blockedReason: hasGsc ? "Bu konuda karşılanmamış gerçek sorgu kümesi yok" : "Search Console bağlı değil: talep ölçülemiyor", signals: s, ...p, priorityReason: p.reason, competitors: [...new Set(list.map((x) => x.domain))],
    });
  }

  // 3) Teknik farklar (oranlar gözlenmiş sayfalardan; bizde eksik olan ve düzeltilebilen öneriye dönüşür)
  const ourSchema = new Set(ours.flatMap((p) => analysis.get(p.id)!.schemaTypes));
  const theirSchema = new Set(pages.flatMap((p) => p.schemaTypes));
  const ourMetaMissing = ours.filter((p) => p.robotsIndex && !p.autoNoindex && !p.metaDescription?.trim() && !["STATIC", "BLOG_INDEX"].includes(p.type));
  const theirMetaPct = pct(pages.filter((p) => p.metaDescription).length, pages.length);
  const ourMetaPct = pct(ours.length - ourMetaMissing.length, ours.length);
  if (theirMetaPct != null && ourMetaPct != null && ourMetaMissing.length && theirMetaPct > ourMetaPct) {
    for (const pg of ourMetaMissing.slice(0, 5)) {
      const s: Signals = { gscDemand: null, keywordDemand: 0, commercialIntent: ["SERVICE", "SECTOR"].includes(pg.type) ? "COMMERCIAL" : "INFORMATIONAL", existingPageFit: pg.path, contentGap: null, technicalGap: "Meta description elle yazılmamış", serviceVerification: null, cannibalizationRisk: null, implementationRisk: "LOW" };
      const p = priorityOf(s, true);
      findings.push({
        key: `TECHNICAL_GAP:meta:${pg.id}`, type: "TECHNICAL_GAP", title: `${pg.path} meta description`, theirs: `Rakip sayfalarının %${theirMetaPct}'inde meta description var`, ours: `Sitede %${ourMetaPct}; ${pg.path} sayfasında yok`,
        why: "Arama sonucundaki açıklama sayfanın kendi cümlelerinden yazılır (yeni iddia yok).", evidence: [{ text: `${pages.length} rakip sayfası incelendi`, quality: "VERIFIED" }],
        action: "Sayfanın kendi metninden meta description (48 saat onay)", actionable: true, blockedReason: null, signals: s, ...p, priorityReason: p.reason, competitors: [...new Set(pages.map((x) => x.domain))],
        proposal: { kind: "META", key: `META:${pg.id}`, pageId: pg.id, path: pg.path },
      });
    }
  }
  for (const [type, why, fix] of [
    ["LocalBusiness", "İşletme türü yapılandırılmış verisi yerel aramalarda işletmeyi tanımlar", "Ayarlar → İşletme: ad, telefon ve tam adres girildiğinde otomatik üretilir (uydurulmaz)"],
    ["FAQPage", "Sık sorulan sorular yapılandırılmış verisi", "Sayfada en az 2 gerçek SSS olduğunda otomatik üretilir"],
  ] as const) {
    const theirHas = type === "LocalBusiness" ? [...theirSchema].some((t) => /LocalBusiness|ProfessionalService/.test(t)) : theirSchema.has(type);
    const ourHas = type === "LocalBusiness" ? [...ourSchema].some((t) => /LocalBusiness|ProfessionalService/.test(t)) : ourSchema.has(type);
    if (!theirHas || ourHas) continue;
    const s: Signals = { gscDemand: null, keywordDemand: 0, commercialIntent: "COMMERCIAL", existingPageFit: null, contentGap: null, technicalGap: `${type} schema yok`, serviceVerification: null, cannibalizationRisk: null, implementationRisk: "LOW" };
    const p = priorityOf(s, false);
    findings.push({
      key: `TECHNICAL_GAP:schema:${type}`, type: "TECHNICAL_GAP", title: `${type} yapılandırılmış verisi`, theirs: `Rakip sayfalarında ${type} işaretlemesi gözlendi`, ours: "Sitede üretilmiyor",
      why, evidence: pages.filter((x) => x.schemaTypes.some((t) => t.includes(type === "LocalBusiness" ? "Business" : type))).slice(0, 3).map((x) => ({ text: `${x.domain}${x.path}: ${x.schemaTypes.join(", ")}`, quality: "VERIFIED" as Quality })),
      action: fix, actionable: false, blockedReason: "Otomatik uygulanamaz: doğrulanmış bilgi gerektirir (schema şablonu gerçek veriyle üretilir)", signals: s, ...p, priorityReason: p.reason, competitors: [...new Set(pages.map((x) => x.domain))],
    });
  }

  // 4) İç link farkı: rakip hizmet sayfalarının ortanca iç link sayısı vs bizim zayıf bağlantılı hizmet sayfaları
  const theirServiceLinks = median(pages.filter((p) => p.category === "service").map((p) => p.internalLinks));
  const lp = toLinkPages(st);
  const stats = linkStats(lp, st.edges);
  for (const sp of stats.filter((x) => x.type === "SERVICE" && x.contextIn < 2).slice(0, 3)) {
    const target = lp.find((x) => x.path === sp.path);
    const sug = target ? suggestLinks(target, lp, st.edges, 1)[0] : null;
    const s: Signals = { gscDemand: null, keywordDemand: 0, commercialIntent: "COMMERCIAL", existingPageFit: sp.path, contentGap: null, technicalGap: `${sp.path} sayfasına ${sp.contextIn} bağlamsal iç link`, serviceVerification: null, cannibalizationRisk: null, implementationRisk: "LOW" };
    const p = priorityOf(s, Boolean(sug));
    findings.push({
      key: `INTERNAL_LINK_GAP:${sp.path}`, type: "INTERNAL_LINK_GAP", title: `${sp.path} iç link desteği`, theirs: `Rakip hizmet sayfalarında ortanca ${theirServiceLinks} site içi bağlantı`, ours: `${sp.path} sayfasına ${sp.contextIn} bağlamsal gelen link`,
      why: "Hizmet sayfasına ilgili sayfalardan doğal bağlantı taranabilirliği ve site içi otoriteyi artırır.", evidence: [{ text: `${pages.filter((x) => x.category === "service").length} rakip hizmet sayfası incelendi`, quality: "VERIFIED" }],
      action: sug ? `${sug.source} → ${sug.target} (“${sug.anchor}”)` : "Uygun kaynak sayfa bulunamadı", actionable: Boolean(sug), blockedReason: sug ? null : "Konu olarak uygun kaynak sayfa yok", signals: s, ...p, priorityReason: p.reason, competitors: [...new Set(pages.map((x) => x.domain))],
      ...(sug ? { proposal: { kind: "INTERNAL_LINK" as const, key: `INTERNAL_LINK:${sug.source}->${sug.target}`, pageId: lp.find((x) => x.path === sug.source)?.id ?? null, path: sug.source, payload: { source: sug.source, target: sug.target, anchor: sug.anchor } } } : {}),
    });
  }

  // 5) Lokasyon kapsamı: yalnızca bilgi (doorway koruması; Faz 3 yayın kapısı aynen)
  const loc = pages.filter((p) => p.category === "location");
  if (loc.length) {
    const ourLoc = ours.filter((p) => ["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"].includes(p.type)).length;
    const s: Signals = { gscDemand: null, keywordDemand: 0, commercialIntent: "LOCAL", existingPageFit: null, contentGap: null, technicalGap: null, serviceVerification: null, cannibalizationRisk: null, implementationRisk: "HIGH" };
    const p = priorityOf(s, false);
    findings.push({
      key: "LOCAL_GAP", type: "LOCAL_GAP", title: "Lokasyon sayfaları", theirs: `Rakipte ${loc.length} lokasyon sayfası: ${loc.slice(0, 6).map((x) => x.path).join(", ")}${loc.length > 6 ? "…" : ""}`, ours: `Sitede yayında ${ourLoc} lokasyon sayfası`,
      why: "Yalnızca bilgi. Lokasyon sayfaları otomatik üretilmez (doorway riski); işletme adı + ilçeye özel doğrulanmış bilgi + yayın kapısı gerekir.",
      evidence: loc.slice(0, 5).map((x) => ({ text: `${x.domain}${x.path}`, quality: "VERIFIED" as Quality })).concat([{ text: "Lokasyon sınıflandırması URL'deki il/ilçe adından", quality: "INFERRED" }]),
      action: "İçerik Planı → ilçe öncelik sırası ve ön koşullar", actionable: false, blockedReason: "Doorway koruması: ilçe sayfaları yalnızca insan onayı ve yayın kapısıyla", signals: s, ...p, priorityReason: p.reason, competitors: [...new Set(loc.map((x) => x.domain))],
    });
  }
  const order: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return { findings: findings.sort((a, b) => order[a.priority] - order[b.priority]), hasGsc, competitors, pages: pages.length };
}

/** Rakip özetleri (liste kartları; yalnızca gözlenen sayılar). */
export function categoryCounts(pages: { category: string | null }[]): { key: Category; label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const p of pages) m.set(p.category ?? "other", (m.get(p.category ?? "other") ?? 0) + 1);
  return (Object.keys(CATEGORY_LABELS) as Category[]).map((k) => ({ key: k, label: CATEGORY_LABELS[k], n: m.get(k) ?? 0 })).filter((x) => x.n);
}
