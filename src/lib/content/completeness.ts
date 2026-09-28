import "server-only";
// EKSİK ALAN TARAMASI (page-completeness-scan). Yeni bir yayın sistemi DEĞİLDİR: her eksik alan
// mevcut öneri yaşam döngüsüne (createProposal → 48 saat → doğrulama → uygulama → HTML/DB/SEO
// kontrolü → geri alma) giren bir öneridir. Öneri anahtarları diğer motorlarla ortaktır
// (TITLE:<sayfa>, META:<sayfa>, CONTENT…), aynı alan için paralel öneri oluşmaz; reddedilen
// öneri 30 gün tekrar üretilmez.
//
// TASLAK GÜVENLİĞİ: bu iş hiçbir zaman yeni sayfa (NEW_PAGE) önerisi üretmez ve hiçbir öneri
// "status" alanına dokunmaz; uygulama hattı da status değişikliğini yalnızca NEW_PAGE için
// kabul eder. Taslak sayfa DRAFT → DRAFT kalır; index/canonical/robots/URL yasak alanlardır.

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { agentMode } from "../settings-schema";
import { parseFaq } from "../seo/analyzer-shared";
import { loadSiteState } from "../seo/analyzer";
import { linkStats, suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { extractMarkdown } from "../text/markdown";
import { resolveTitle } from "../seo/meta";
import { containsPhrase } from "../text/slug";
import { createProposal, type CreateResult } from "../proposals/lifecycle";

export const DRAFT_WINDOW_DAYS = 30;
export const MAX_READY_PER_RUN = 10; // çalıştırma başına en çok hazır (onay penceresine giren) öneri
export const MAX_ATTEMPTS_PER_RUN = 25; // engellenen öneriler de görünür olsun ama yığılmasın

export type Missing = { field: string; type: string; risk: "AUTO" | "CONTROLLED"; key: string; title: string; payload?: Record<string, unknown>; query?: string | null };
export type PageGaps = { pageId: string; path: string; status: string; type: string; missing: Missing[] };

/**
 * Taranacak sayfalar: yayındaki sayfalar + son 30 günde panelden/otopilotla oluşturulmuş (sürüm
 * geçmişi "Oluşturuldu" kaydı olan) taslaklar. Seed ile gelen boş taslaklar (sürüm geçmişi yok)
 * topluca öneri üretmesin diye dahil edilmez.
 */
export async function eligiblePages(now = new Date()) {
  const since = new Date(now.getTime() - DRAFT_WINDOW_DAYS * 86400_000);
  return db.page.findMany({
    where: {
      OR: [
        { status: "PUBLISHED" },
        { status: "DRAFT", createdAt: { gte: since }, versions: { some: { note: "Oluşturuldu" } } },
      ],
    },
    // En yeni sayfalar önce: yeni eklenen (elle/otopilot) sayfaların eksikleri bütçeyi önce alır
    orderBy: [{ createdAt: "desc" }],
  });
}

/** Sayfa başına eksik alanlar (öncelik sırası: ucuz/güvenli → yapay zekâ gerektiren). */
export async function findGaps(now = new Date()): Promise<PageGaps[]> {
  const pages = await eligiblePages(now);
  const st = await loadSiteState();
  const lp = toLinkPages(st);
  const inlinks = new Map(linkStats(lp, st.edges).map((s) => [s.path, s.contextIn]));
  const out: PageGaps[] = [];
  for (const p of pages) {
    const m: Missing[] = [];
    const add = (field: string, type: string, risk: Missing["risk"], extra: Partial<Missing> = {}) => m.push({ field, type, risk, key: `${type}:${p.id}`, title: `${p.path} — ${field}`, ...extra });
    if (!p.primaryKeyword?.trim()) add("ana anahtar kelime", "KEYWORD", "AUTO");
    if (!p.h1?.trim()) add("H1", "H1", "AUTO");
    // Title: alan boş diye değil, şablonun ürettiği başlık yetersizse (ana kelime yok / uzunluk dışı)
    const shown = resolveTitle(p, st.settings.seo);
    if (p.primaryKeyword?.trim() && (!containsPhrase(shown, p.primaryKeyword) || shown.length < 30 || shown.length > 60)) add("title", "TITLE", "AUTO", { query: p.primaryKeyword.toLocaleLowerCase("tr-TR") });
    if (!p.metaDescription?.trim()) add("meta description", "META", "AUTO");
    if (!p.secondaryKeywords.length) add("ikincil kelimeler", "SECONDARY_KEYWORDS", "AUTO");
    if (p.type === "BLOG_POST" && !p.excerpt?.trim()) add("özet", "EXCERPT", "AUTO");
    if (!p.ogImageId && extractMarkdown(p.body).images.length) add("OG görseli", "OG_IMAGE", "AUTO");
    if (extractMarkdown(p.body).images.some((i) => !i.alt.trim())) add("görsel alt metni", "ALT_TEXT", "AUTO");
    if (!p.intro?.trim() && p.type !== "STATIC") add("giriş paragrafı", "INTRO", "CONTROLLED");
    if (parseFaq(p.faq).length < 2 && !["STATIC", "BLOG_INDEX", "HOME"].includes(p.type)) add("SSS", "FAQ", "CONTROLLED");
    // İç link: yalnızca yayındaki sayfaya gelen bağlantı önerilir (taslağa link sitede görünmez)
    if (p.status === "PUBLISHED" && (inlinks.get(p.path) ?? 0) < 2 && !["HOME", "STATIC", "BLOG_INDEX"].includes(p.type)) {
      const target = lp.find((x) => x.path === p.path);
      const sug = target ? suggestLinks(target, lp, st.edges, 1)[0] : null;
      if (sug) m.push({ field: "iç link", type: "INTERNAL_LINK", risk: "AUTO", key: `INTERNAL_LINK:${sug.source}->${sug.target}`, title: `${sug.source} → ${sug.target} iç link`, payload: { source: sug.source, target: sug.target, anchor: sug.anchor } });
    }
    if (m.length) out.push({ pageId: p.id, path: p.path, status: p.status, type: p.type, missing: m });
  }
  return out;
}

export type CompletenessSummary = { pages: number; gaps: number; created: Record<string, number>; items: { title: string; status: string; note: string }[]; skippedReason?: string };

export async function runCompletenessScan(opts: { now?: Date } = {}): Promise<CompletenessSummary> {
  const now = opts.now ?? new Date();
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const mode = agentMode(ap);
  const gaps = await findGaps(now);
  const s: CompletenessSummary = { pages: gaps.length, gaps: gaps.reduce((n, g) => n + g.missing.length, 0), created: {}, items: [] };
  if (mode === "OBSERVE") return { ...s, skippedReason: "OBSERVE modu: yalnızca ölçülür, öneri oluşturulmaz" };
  // Haftalık değişiklik bütçesi diğer motorlarla ortak
  const used = await db.autopilotAction.count({ where: { source: "completeness", createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) }, status: { in: ["pending_approval", "applying", "applied"] } } });
  let ready = Math.min(MAX_READY_PER_RUN, Math.max(0, ap.maxChangesPerWeek - used));
  if (!ready) return { ...s, skippedReason: `Haftalık değişiklik sınırı (${ap.maxChangesPerWeek}) doldu` };
  let attempts = MAX_ATTEMPTS_PER_RUN;
  const window = { model: settings.integrations.aiModel, windowHours: ap.approvalWindowHours || 48 };
  for (const g of gaps) {
    for (const m of g.missing) {
      if (ready <= 0 || attempts <= 0) return s;
      attempts--;
      const r: CreateResult = await createProposal({
        key: m.key, type: m.type, risk: m.risk, category: "CONTENT", source: "completeness", title: `[Eksik alan] ${m.title}`,
        reason: `${g.status === "DRAFT" ? "Taslak sayfa" : "Yayındaki sayfa"} ${g.path}: ${m.field} eksik`, score: m.risk === "AUTO" ? 40 : 30,
        pageId: m.type === "INTERNAL_LINK" ? (await db.page.findUnique({ where: { path: String(m.payload!.source) }, select: { id: true } }))?.id ?? null : g.pageId,
        query: m.query ?? null,
        proposal: { pagePath: g.path, pageStatus: g.status, field: m.field, ...(m.payload ? { payload: m.payload } : {}) },
        allowAuto: mode === "AUTONOMOUS" && (m.risk === "AUTO" ? ap.autoApplySafe : ap.autoApplyControlled),
        noAutoReason: mode === "ASSIST" ? "ASSIST modu: öneri hazır, onayla uygulanır" : "Bu risk sınıfında otomatik uygulama kapalı",
      }, window);
      if (r.duplicate) { attempts++; continue; } // mevcut öneri var: bütçe harcanmaz
      s.created[r.status] = (s.created[r.status] ?? 0) + 1;
      s.items.push({ title: m.title, status: r.status, note: r.note });
      if (r.status === "pending_approval") ready--;
    }
  }
  return s;
}
