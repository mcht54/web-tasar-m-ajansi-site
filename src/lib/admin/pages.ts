import "server-only";
import { updateTag, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { Prisma } from "@/generated/prisma/client";
import { can } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { isValidSlug, normalizeKeyword } from "../text/slug";
import { PAGES_TAG } from "../site/graph-data";
import { invalidateRouting } from "../routing/registry";
import { PLACEHOLDER_RE, parseFaq, unverifiedCount } from "../seo/analyzer-shared";
import { LOCATION_TYPES, locationGate } from "../seo/location-quality";

/** Sürüm geçmişinde saklanan ve geri yüklenebilen alanlar. */
export const VERSIONED_FIELDS = [
  "path", "status", "name", "breadcrumbLabel", "seoTitle", "metaDescription", "h1", "intro", "body", "faq",
  "canonical", "robotsIndex", "robotsFollow", "ogTitle", "ogDescription", "ogImageId", "schemaDisabled",
  "primaryKeyword", "secondaryKeywords", "excerpt", "category", "authorName", "relatedLinks",
] as const;

/** SEO uzmanı/Yönetici izni gerektiren teknik alanlar. */
const TECHNICAL_FIELDS = new Set(["path", "canonical", "robotsIndex", "robotsFollow", "schemaDisabled"]);

export const FIELD_LABELS: Record<string, string> = {
  path: "URL", status: "Yayın durumu", name: "Ad", breadcrumbLabel: "Breadcrumb etiketi", seoTitle: "Title",
  metaDescription: "Meta description", h1: "H1", intro: "Giriş paragrafı", body: "İçerik", faq: "SSS",
  canonical: "Canonical", robotsIndex: "Index", robotsFollow: "Follow", ogTitle: "OG title",
  ogDescription: "OG description", ogImageId: "OG görseli", schemaDisabled: "Kapalı schema türleri",
  primaryKeyword: "Ana anahtar kelime", secondaryKeywords: "İkincil kelimeler", excerpt: "Özet",
  category: "Kategori", authorName: "Yazar", relatedLinks: "İlgili sayfa bağlantıları",
};

const RESERVED = ["/yonetim", "/api", "/medya", "/_next", "/sitemap", "/robots.txt", "/favicon"];

export function validatePath(path: string): string | null {
  if (path === "/") return null;
  if (!path.startsWith("/") || path.endsWith("/")) return "URL / ile başlamalı ve / ile bitmemeli";
  const segs = path.slice(1).split("/");
  if (segs.length > 4) return "URL en fazla 4 seviye olabilir";
  if (!segs.every(isValidSlug)) return "URL yalnızca küçük harf, rakam ve tire içerebilir (Türkçe karakter yok)";
  if (RESERVED.some((r) => path === r || path.startsWith(`${r}/`)) || path.startsWith("/sitemap")) return "Bu URL sistem tarafından kullanılıyor";
  return null;
}

const optText = (max: number) => z.string().max(max).transform((s) => s.trim() || null).nullable();

export const pageInputSchema = z.object({
  path: z.string().trim().max(200),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  name: z.string().trim().min(2, "Ad en az 2 karakter").max(160),
  breadcrumbLabel: optText(80),
  seoTitle: optText(120),
  metaDescription: optText(320),
  h1: optText(200),
  intro: optText(1500),
  body: optText(100_000),
  faq: z.array(z.object({ q: z.string().trim().max(300), a: z.string().trim().max(2000) })).max(30),
  canonical: optText(300),
  robotsIndex: z.boolean(),
  robotsFollow: z.boolean(),
  ogTitle: optText(120),
  ogDescription: optText(300),
  ogImageId: optText(40),
  schemaDisabled: z.array(z.string().max(40)).max(10),
  primaryKeyword: optText(120),
  secondaryKeywords: z.array(z.string().trim().max(120)).max(20),
  excerpt: optText(400),
  category: optText(60),
  authorName: optText(80),
  // Otonom iç link motorunun bağlantıları; verilmezse mevcut değer korunur
  relatedLinks: z.array(z.object({ path: z.string().max(200), anchor: z.string().max(120), reason: z.string().max(300).optional() })).max(8).nullish(),
});
export type PageInput = z.infer<typeof pageInputSchema>;

export function snapshotOf(p: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(VERSIONED_FIELDS.map((f) => [f, p[f] ?? null]));
}

function show(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 4000 ? `${s.slice(0, 4000)}…` : s;
}

/** Anahtar sırasından bağımsız karşılaştırma (JSONB anahtarları sıralı saklar). */
function stable(v: unknown): string {
  return JSON.stringify(v ?? null, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val,
  );
}

export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return VERSIONED_FIELDS.filter((f) => stable(before[f]) !== stable(after[f]));
}

export type SaveResult = { ok: true; changed: string[]; pageId: string } | { ok: false; error: string };

/**
 * Sayfayı kaydeder: yetki kontrolü, doğrulama, alan logu, sürüm, URL
 * değişiminde otomatik 301 ve önbellek tazeleme.
 */
export async function savePage(user: SessionUser, pageId: string, input: PageInput, note?: string, opts: { gateChecked?: boolean } = {}): Promise<SaveResult> {
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page) return { ok: false, error: "Sayfa bulunamadı" };

  // Yayın kapısı (tüm kayıt yolları buradan geçer: editör, AI onayı, sürüme dönüş)
  const publishing = input.status === "PUBLISHED" && page.status !== "PUBLISHED";
  if (publishing) {
    const texts = [input.intro, input.body, input.h1, input.seoTitle, input.metaDescription, JSON.stringify(input.faq)];
    if (unverifiedCount(...texts) > 0) return { ok: false, error: "Sayfa yayınlanamaz: [DOĞRULANMALI] işaretleri var. Önce gerçek bilgiyle doldurun." };
    if (texts.some((t) => t && PLACEHOLDER_RE.test(t))) return { ok: false, error: "Sayfa yayınlanamaz: yer tutucu (şablon) metin kalmış." };
  }
  if (publishing && LOCATION_TYPES.has(page.type) && !opts.gateChecked) {
    // İçeriği taslak olarak kaydet, kapıyı güncel veriyle hesapla, geçerse yayınla.
    const draft = await savePage(user, pageId, { ...input, status: page.status }, note);
    if (!draft.ok) return draft;
    const gate = await locationGate(pageId);
    if (gate && !gate.ready) {
      const failed = gate.items.filter((i) => i.critical && i.status === "FAIL").map((i) => i.label);
      return { ok: false, error: `İçerik kaydedildi ancak sayfa YAYINA HAZIR DEĞİL — başarısız kritik kontroller: ${failed.join(", ")}.` };
    }
    const pub = await savePage(user, pageId, input, "Kalite kapısı geçti, yayınlandı", { gateChecked: true });
    return pub.ok ? { ...pub, changed: [...new Set([...(draft.ok ? draft.changed : []), ...pub.changed])] } : pub;
  }
  const pathError = validatePath(input.path);
  if (pathError) return { ok: false, error: pathError };
  if (page.type === "HOME" && input.path !== "/") return { ok: false, error: "Ana sayfanın URL'si değiştirilemez" };

  const next = { ...input, faq: parseFaq(input.faq), relatedLinks: input.relatedLinks === undefined ? (page.relatedLinks as PageInput["relatedLinks"]) ?? null : input.relatedLinks };
  const before = snapshotOf(page as unknown as Record<string, unknown>);
  const changed = diffFields(before, next);
  if (changed.length === 0) return { ok: true, changed, pageId };

  const technical = changed.filter((f) => TECHNICAL_FIELDS.has(f));
  if (technical.length && !can(user.role, "seo")) {
    return { ok: false, error: `Bu alanlar için SEO yetkisi gerekiyor: ${technical.map((f) => FIELD_LABELS[f]).join(", ")}` };
  }
  if (input.path !== page.path && (await db.page.findUnique({ where: { path: input.path } }))) {
    return { ok: false, error: "Bu URL başka bir sayfada kullanılıyor" };
  }

  const contentChanged = changed.some((f) => ["h1", "intro", "body", "faq", "seoTitle", "metaDescription"].includes(f));
  const lastVersion = await db.pageVersion.findFirst({ where: { pageId }, orderBy: { version: "desc" }, select: { version: true, snapshot: true } });
  // Sürüm geçmişinde değişiklik öncesi tam durum yoksa (seed kaydı veya hiç sürüm yok),
  // önce mevcut hâli kaydet: böylece ilk düzenleme de geri alınabilir.
  // Ayrıca son sürüm mevcut durumdan farklıysa (sürüm dışı değişiklik) gerçek durum önce kaydedilir.
  const lastSnap = (lastVersion?.snapshot ?? null) as Record<string, unknown> | null;
  const needsBaseline = !lastSnap || Boolean(lastSnap.seed) || diffFields(lastSnap, before).length > 0;
  const baseVersion = (lastVersion?.version ?? 0) + (needsBaseline ? 1 : 0);

  await db.$transaction(async (tx) => {
    await tx.page.update({
      where: { id: pageId },
      data: {
        ...(next as unknown as Prisma.PageUpdateInput),
        faq: next.faq,
        relatedLinks: next.relatedLinks ?? Prisma.DbNull,
        ...(contentChanged ? { contentUpdatedAt: new Date() } : {}),
        ...(input.status === "PUBLISHED" && !page.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    if (needsBaseline) {
      await tx.pageVersion.create({
        data: { pageId, version: baseVersion, snapshot: before as object, note: "Değişiklik öncesi durum (otomatik)", userName: "Sistem" },
      });
    }
    await tx.pageVersion.create({
      data: { pageId, version: baseVersion + 1, snapshot: snapshotOf(next) as object, note: note ?? null, userId: user.id, userName: user.name },
    });
    await tx.seoChangeLog.createMany({
      data: changed.map((f) => ({
        pageId, path: input.path, field: FIELD_LABELS[f] ?? f, before: show(before[f]), after: show((next as Record<string, unknown>)[f]),
        userId: user.id, userName: user.name,
      })),
    });
    // Yayındaki sayfanın URL'si değişirse eski adres yeni adrese kalıcı yönlenir.
    if (input.path !== page.path && page.status === "PUBLISHED") {
      await tx.redirect.upsert({
        where: { fromPath: page.path },
        create: { fromPath: page.path, toPath: input.path, statusCode: 301, note: "URL değişikliği (otomatik)", createdBy: user.name },
        update: { toPath: input.path, statusCode: 301, active: true },
      });
      // Eski adrese işaret eden yönlendirmeler zincir oluşturmasın
      await tx.redirect.updateMany({ where: { toPath: page.path }, data: { toPath: input.path } });
      // Yeni adres daha önce yönlendirme kaynağıysa kaldır (döngü olmasın)
      await tx.redirect.deleteMany({ where: { fromPath: input.path } });
    }
    // Hedef anahtar kelime tablosunda yoksa ekle (sıralama takibine girsin)
    if (next.primaryKeyword && changed.includes("primaryKeyword")) {
      const normalized = normalizeKeyword(next.primaryKeyword);
      await tx.keyword.upsert({
        where: { normalized },
        create: { phrase: next.primaryKeyword, normalized, targetPageId: pageId, provinceId: page.provinceId, districtId: page.districtId, serviceId: page.serviceId, sectorId: page.sectorId },
        update: {},
      });
    }
  });

  refreshPublic([page.path, input.path]);
  return { ok: true, changed, pageId };
}

/** Herkese açık önbelleği ve proxy yönlendirme tablosunu tazeler. */
export function refreshPublic(paths: string[] = []) {
  invalidateRouting();
  try {
    updateTag(PAGES_TAG);
    for (const p of new Set(paths)) revalidatePath(p);
    revalidatePath("/sitemap.xml");
  } catch {
    // Next.js istek bağlamı dışında (CLI, test) önbellek zaten yok; saatlik ISR tazeler.
  }
}

export async function restoreVersion(user: SessionUser, pageId: string, versionId: string): Promise<SaveResult> {
  const v = await db.pageVersion.findUnique({ where: { id: versionId } });
  if (!v || v.pageId !== pageId) return { ok: false, error: "Sürüm bulunamadı" };
  const snap = v.snapshot as Record<string, unknown>;
  if (snap.seed) return { ok: false, error: "İlk içerik kaydı geri yüklenebilir alan içermiyor" };
  const current = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const merged = { ...snapshotOf(current as unknown as Record<string, unknown>), ...snap };
  const parsed = pageInputSchema.safeParse({ ...merged, faq: parseFaq(merged.faq) });
  if (!parsed.success) return { ok: false, error: "Sürüm verisi geçersiz" };
  return savePage(user, pageId, parsed.data, `Sürüm ${v.version} geri yüklendi`);
}

/** Yeni sayfa (kombinasyon/blog/sabit) oluşturur; her zaman TASLAK başlar. */
export async function createPage(
  user: SessionUser,
  data: Pick<Prisma.PageUncheckedCreateInput, "path" | "type" | "name" | "h1" | "breadcrumbLabel" | "primaryKeyword" | "serviceId" | "provinceId" | "districtId" | "sectorId" | "category">,
): Promise<SaveResult> {
  const err = validatePath(data.path);
  if (err) return { ok: false, error: err };
  if (await db.page.findUnique({ where: { path: data.path } })) return { ok: false, error: "Bu URL zaten var" };
  const page = await db.page.create({ data: { ...data, status: "DRAFT" } });
  // İlk sürüm sayfanın tam anlık görüntüsüdür (varsayılan değerler dahil)
  await db.pageVersion.create({
    data: { pageId: page.id, version: 1, snapshot: snapshotOf(page as unknown as Record<string, unknown>) as object, note: "Oluşturuldu", userId: user.id, userName: user.name },
  });
  await db.seoChangeLog.create({ data: { pageId: page.id, path: page.path, field: "Sayfa", before: null, after: "Oluşturuldu (taslak)", userId: user.id, userName: user.name } });
  if (data.primaryKeyword) {
    const normalized = normalizeKeyword(data.primaryKeyword);
    await db.keyword.upsert({
      where: { normalized },
      create: { phrase: data.primaryKeyword, normalized, targetPageId: page.id, provinceId: data.provinceId, districtId: data.districtId, serviceId: data.serviceId, sectorId: data.sectorId },
      update: {},
    });
  }
  refreshPublic();
  return { ok: true, changed: [], pageId: page.id };
}
