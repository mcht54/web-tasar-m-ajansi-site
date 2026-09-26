import "server-only";
import { loadAiKey } from "./key";
import { db } from "../db";
import type { SessionUser } from "../auth/session";
import { getSettingsFresh } from "../settings";
import { analyzePage, loadSiteState } from "../seo/analyzer";
import { suggestLinks } from "../seo/links";
import { toLinkPages } from "../seo/opportunities";
import { extractMarkdown } from "../text/markdown";
import { parseFaq } from "../seo/analyzer-shared";
import { pageInputSchema, restoreVersion, savePage, snapshotOf } from "../admin/pages";
import { buildFixContext, contextForAi, ruleFix } from "./fix";
import { type AiKind, type AiOutput, type PageContext } from "./types";
import { ruleBrief, ruleImprove, ruleMeta } from "./rules";
import { aiErrorMessage, claudeAvailable, claudeFix, claudeSuggest } from "./claude";

/** Yapay zekâya verilecek doğrulanmış olgu sayfası (resmî veri + editör notları). */
async function locationFacts(provinceId: number | null, districtId: number | null): Promise<string> {
  if (!provinceId) return "";
  const p = await db.province.findUniqueOrThrow({ where: { id: provinceId }, include: { districts: { orderBy: { population: "desc" } }, sectors: true } });
  const fmt = (n: number | null | undefined) => (n == null ? "bilinmiyor" : n.toLocaleString("tr-TR"));
  const lines = [
    `İl: ${p.name} (plaka ${String(p.id).padStart(2, "0")}), ${p.region} Bölgesi`,
    `İl nüfusu: ${fmt(p.population)} (${p.dataSource ?? "kaynak yok"})`,
    `Yüzölçümü: ${fmt(p.areaKm2)} km² · Rakım: ${fmt(p.altitude)} m · ${p.isMetropolitan ? "Büyükşehir" : "Büyükşehir değil"} · ${p.isCoastal ? "Kıyı ili" : "Kıyısı yok"}`,
    `İlçe sayısı: ${p.districts.length} · Mahalle sayısı: ${fmt(p.neighborhoodCount)}`,
    `Nüfusa göre ilçeler: ${p.districts.slice(0, 12).map((d) => `${d.name} (${fmt(d.population)})`).join(", ")}`,
    p.sectors.length ? `Editörün işaretlediği ilgili sektörler: ${p.sectors.map((s) => s.name).join(", ")}` : "",
    p.localNotes ? `İl hakkında editör notları: ${p.localNotes}` : "İl hakkında editör notu YOK — yerel ayrıntı için [DOĞRULANMALI] kullan.",
  ];
  if (districtId) {
    const d = p.districts.find((x) => x.id === districtId);
    if (d) {
      lines.unshift(`İlçe: ${d.name} (${p.name}) · nüfus ${fmt(d.population)} · mahalle ${fmt(d.neighborhoodCount)} · yüzölçümü ${fmt(d.areaKm2)} km²`);
      lines.push(d.localNotes ? `İlçe hakkında editör notları: ${d.localNotes}` : "İlçe hakkında editör notu YOK — yerel ayrıntı için [DOĞRULANMALI] kullan.");
    }
  }
  return lines.filter(Boolean).join("\n");
}

/** ÇÖZÜM ÖNER: fırsat için gerçek veriye dayalı düzeltme önerisi üretir ve onaya bırakır. */
export async function generateFix(user: SessionUser, pageId: string, focusQuery: string | null, category: string | null) {
  const settings = await getSettingsFresh();
  const ctx = await buildFixContext(pageId, focusQuery, category);
  await loadAiKey();
  const useClaude = settings.integrations.aiProvider === "anthropic" && claudeAvailable();
  let data;
  let provider = "kural";
  if (useClaude) {
    try {
      data = await claudeFix(contextForAi(ctx), settings.integrations.aiModel);
      provider = `anthropic:${settings.integrations.aiModel}`;
    } catch (e) {
      throw new Error(aiErrorMessage(e));
    }
  } else data = ruleFix(ctx);
  const current = { seoTitle: ctx.current.seoTitle, metaDescription: ctx.current.metaDescription, h1: ctx.current.h1 };
  return db.aiSuggestion.create({
    data: {
      pageId, kind: "fix", provider, createdBy: user.name,
      input: { path: ctx.path, focusQuery, category, queries: ctx.queries === null ? "veri yok" : ctx.queries.length } as object,
      output: { kind: "fix", data, current } as unknown as object,
    },
  });
}

const MARKER = /\[DOĞRULANMALI/;

/** Uygula: seçilen alanlar sürüm geçmişine yazılarak sayfaya uygulanır. */
export async function applyFix(user: SessionUser, id: string, fields: { seoTitle?: string; metaDescription?: string; h1?: string; faq?: { q: string; a: string }[] }) {
  const s = await db.aiSuggestion.findUniqueOrThrow({ where: { id } });
  if (s.status !== "PENDING" || !s.pageId) throw new Error("Bu öneri zaten sonuçlandırılmış");
  const chosen = Object.entries(fields).filter(([, v]) => (Array.isArray(v) ? v.length : typeof v === "string" && v.trim()));
  if (!chosen.length) throw new Error("Uygulanacak alan seçilmedi");
  for (const [k, v] of chosen) {
    if (MARKER.test(JSON.stringify(v))) throw new Error(`“${k}” alanında [DOĞRULANMALI] işareti var; önce gerçek bilgiyle düzenleyin`);
  }
  const page = await db.page.findUniqueOrThrow({ where: { id: s.pageId } });
  const current = snapshotOf(page as unknown as Record<string, unknown>);
  const input = pageInputSchema.parse({
    ...current,
    faq: fields.faq?.length ? [...parseFaq(current.faq), ...fields.faq] : parseFaq(current.faq),
    ...(fields.seoTitle?.trim() ? { seoTitle: fields.seoTitle.trim() } : {}),
    ...(fields.metaDescription?.trim() ? { metaDescription: fields.metaDescription.trim() } : {}),
    ...(fields.h1?.trim() ? { h1: fields.h1.trim() } : {}),
  });
  const r = await savePage(user, page.id, input, `ÇÖZÜM ÖNER uygulandı (${s.provider})`);
  if (!r.ok) throw new Error(r.error);
  // Geri alma hedefi: az önce oluşan sürümden bir önceki (tam) sürüm
  const [, before] = await db.pageVersion.findMany({ where: { pageId: page.id }, orderBy: { version: "desc" }, take: 2, select: { id: true } });
  const out = s.output as Record<string, unknown>;
  await db.aiSuggestion.update({
    where: { id },
    data: {
      status: "APPROVED", reviewedBy: user.name, reviewedAt: new Date(),
      output: { ...out, applied: { fromVersionId: before?.id ?? null, fields: chosen.map(([k]) => k), at: new Date().toISOString() } } as object,
    },
  });
  return r;
}

/** Geri al: öneri uygulanmadan önceki sürüme döner (yeni sürüm olarak kaydedilir). */
export async function rollbackFix(user: SessionUser, id: string) {
  const s = await db.aiSuggestion.findUniqueOrThrow({ where: { id } });
  const out = s.output as { applied?: { fromVersionId: string | null; rolledBack?: boolean } };
  if (!s.pageId || !out.applied?.fromVersionId) throw new Error("Geri alınacak uygulama bulunamadı");
  if (out.applied.rolledBack) throw new Error("Bu değişiklik zaten geri alındı");
  const r = await restoreVersion(user, s.pageId, out.applied.fromVersionId);
  if (!r.ok) throw new Error(r.error);
  await db.aiSuggestion.update({ where: { id }, data: { output: { ...(s.output as object), applied: { ...out.applied, rolledBack: true } } as object } });
}

export async function generateSuggestion(user: SessionUser, kind: AiKind, pageId: string | null) {
  const [settings, state] = await Promise.all([getSettingsFresh(), loadSiteState()]);
  await loadAiKey();
  const useClaude = settings.integrations.aiProvider === "anthropic" && claudeAvailable();
  let output: AiOutput;
  let provider = useClaude ? `anthropic:${settings.integrations.aiModel}` : "kural";
  let input: Record<string, unknown> = {};

  if (kind === "fix") {
    if (!pageId) throw new Error("Sayfa seçin");
    return generateFix(user, pageId, null, null);
  }
  if (kind === "clustering") {
    const keywords = (await db.keyword.findMany({ select: { phrase: true } })).map((k) => k.phrase);
    const pages = state.pages.filter((p) => p.status === "PUBLISHED").map((p) => p.path);
    input = { keywords: keywords.length };
    if (!useClaude) throw new Error("Kümeleme için yapay zekâ sağlayıcısı gerekir (Ayarlar > SEO Entegrasyonları + ANTHROPIC_API_KEY)");
    output = await claudeSuggest("clustering", { keywords, pages }, settings.integrations.aiModel);
  } else {
    if (!pageId) throw new Error("Sayfa seçin");
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) throw new Error("Sayfa bulunamadı");
    const a = analyzePage(page, state);
    const [province, district] = await Promise.all([
      page.provinceId ? db.province.findUnique({ where: { id: page.provinceId }, select: { localNotes: true } }) : null,
      page.districtId ? db.district.findUnique({ where: { id: page.districtId }, select: { localNotes: true } }) : null,
    ]);
    const ctx: PageContext = {
      path: page.path, type: page.type, name: page.name, h1: page.h1 ?? page.name, intro: page.intro ?? "",
      bodyExcerpt: extractMarkdown(page.body).text.slice(0, 6000), primaryKeyword: page.primaryKeyword,
      secondaryKeywords: page.secondaryKeywords, currentTitle: a.title, currentDescription: page.metaDescription ?? "",
      failingChecks: a.seo.checks.filter((c) => c.status === "FAIL" || c.status === "WARN").map((c) => `${c.label}: ${c.message}`),
      location: [page.district?.name, page.province?.name].filter(Boolean).join(", ") || null,
      sector: page.sector?.name ?? null, service: page.service?.name ?? null,
      localNotes: [province?.localNotes, district?.localNotes].filter(Boolean).join("\n") || null, siteName: settings.site.siteName,
    };
    if (kind === "draft") {
      if (!["CITY", "DISTRICT", "SERVICE_LOCATION", "SECTOR_LOCATION"].includes(page.type)) throw new Error("Yerel taslak yalnızca il/ilçe ve kombinasyon sayfaları için");
      if (!useClaude) throw new Error("Yerel taslak için yapay zekâ sağlayıcısı gerekir (Ayarlar > SEO Entegrasyonları + ANTHROPIC_API_KEY). Anahtarsız kullanımda Lokasyon ekranındaki brief'i kullanın.");
      ctx.facts = await locationFacts(page.provinceId, page.districtId);
      ctx.links = state.graph.nodes.filter((n) => n.published && n.type !== "STATIC" && n.type !== "HOME").slice(0, 60).map((n) => ({ path: n.path, label: n.anchor }));
    }
    input = { path: page.path, primaryKeyword: page.primaryKeyword };
    if (kind === "links") {
      provider = "kural";
      const lp = toLinkPages(state);
      const target = lp.find((p) => p.id === pageId)!;
      output = { kind: "links", data: { links: suggestLinks(target, lp, state.edges, 8).map((s) => ({ source: s.source, anchor: s.anchor, reasons: s.reasons })) } };
    } else if (useClaude) {
      try {
        output = await claudeSuggest(kind, ctx, settings.integrations.aiModel);
      } catch (e) {
        throw new Error(aiErrorMessage(e));
      }
    } else {
      output = kind === "meta" ? ruleMeta(ctx) : kind === "brief" ? ruleBrief(ctx) : ruleImprove(ctx);
      if (kind === "draft") throw new Error("Yerel taslak için yapay zekâ sağlayıcısı gerekir");
    }
  }
  return db.aiSuggestion.create({
    data: { pageId, kind, provider, input: input as object, output: output as unknown as object, createdBy: user.name },
  });
}

/** Onay: title/meta/H1 önerisi sayfaya normal kayıt akışıyla (sürüm + log) uygulanır. */
export async function approveSuggestion(user: SessionUser, id: string, optionIndex: number) {
  const s = await db.aiSuggestion.findUniqueOrThrow({ where: { id } });
  if (s.status !== "PENDING") throw new Error("Bu öneri zaten sonuçlandırılmış");
  const out = s.output as unknown as AiOutput;
  if (out.kind === "meta" && s.pageId) {
    const opt = out.data.options[optionIndex];
    if (!opt) throw new Error("Seçenek bulunamadı");
    const page = await db.page.findUniqueOrThrow({ where: { id: s.pageId } });
    const current = snapshotOf(page as unknown as Record<string, unknown>);
    const input = pageInputSchema.parse({
      ...current, faq: parseFaq(current.faq), seoTitle: opt.seoTitle, metaDescription: opt.metaDescription, h1: opt.h1,
    });
    const r = await savePage(user, s.pageId, input, `AI önerisi onaylandı (${s.provider})`);
    if (!r.ok) throw new Error(r.error);
  }
  if (out.kind === "draft" && s.pageId) {
    // Taslak sayfaya yazılır ama sayfa TASLAK kalır; [DOĞRULANMALI] işaretleri
    // temizlenmeden hazırlık kontrolü geçmez.
    const page = await db.page.findUniqueOrThrow({ where: { id: s.pageId } });
    const current = snapshotOf(page as unknown as Record<string, unknown>);
    const d = out.data;
    const input = pageInputSchema.parse({
      ...current, faq: d.faq, seoTitle: d.seoTitle, metaDescription: d.metaDescription, h1: d.h1, intro: d.intro, body: d.body,
      status: page.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    });
    const r = await savePage(user, s.pageId, input, `AI taslağı uygulandı (${s.provider}) — doğrulama bekliyor`);
    if (!r.ok) throw new Error(r.error);
  }
  // Brief/iyileştirme/link önerileri metni otomatik değiştirmez; onay "kabul edildi" kaydıdır.
  await db.aiSuggestion.update({ where: { id }, data: { status: "APPROVED", reviewedBy: user.name, reviewedAt: new Date() } });
}
