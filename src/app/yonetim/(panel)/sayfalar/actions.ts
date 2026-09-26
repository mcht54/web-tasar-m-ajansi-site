"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createPage, restoreVersion, savePage, refreshPublic } from "@/lib/admin/pages";
import { formToInput } from "@/lib/admin/page-form";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { analyzeAndStore, analyzeUnsaved, runFullAnalysis, type PageAnalysis } from "@/lib/seo/analyzer";
import { slugify } from "@/lib/text/slug";

export type EditorState = {
  ok: boolean;
  message: string;
  confirm?: { key: "confirmPublish" | "confirmNoindex"; text: string }[];
  analysis?: PageAnalysis | null;
};

export async function savePageAction(_prev: EditorState, form: FormData): Promise<EditorState> {
  const user = await requireUser("content");
  const id = String(form.get("id"));
  const { input, error } = formToInput(form);
  if (!input) return { ok: false, message: error ?? "Geçersiz veri" };
  const current = await db.page.findUnique({ where: { id }, select: { status: true, robotsIndex: true, path: true } });
  if (!current) return { ok: false, message: "Sayfa bulunamadı" };

  // Uyarı gerektiren işlemler: açık onay olmadan kaydedilmez.
  const confirm: EditorState["confirm"] = [];
  if (input.status === "PUBLISHED" && current.status !== "PUBLISHED" && form.get("confirmPublish") !== "on") {
    const a = await analyzeUnsaved(id, { ...input, faq: input.faq } as never);
    const fails = a?.readiness.items.filter((i) => i.status === "FAIL") ?? [];
    if (fails.length) {
      confirm.push({
        key: "confirmPublish",
        text: `Yayına hazırlık kontrolünde ${fails.length} başarısız madde var (${fails.map((f) => f.label).join(", ")}). Yine de yayınlamak için onaylayın.`,
      });
    }
  }
  if (!input.robotsIndex && current.robotsIndex && form.get("confirmNoindex") !== "on") {
    const [clicks, kws] = await Promise.all([
      db.gscPageDaily.aggregate({ where: { page: { endsWith: current.path } }, _sum: { clicks: true } }),
      db.keyword.count({ where: { targetPageId: id } }),
    ]);
    const c = clicks._sum.clicks ?? 0;
    confirm.push({
      key: "confirmNoindex",
      text: `NOINDEX bu sayfayı Google'dan kaldırır.${c ? ` Sayfa Search Console'da ${c} tıklama almış.` : ""}${kws ? ` ${kws} anahtar kelime bu sayfayı hedefliyor.` : ""} Emin misiniz?`,
    });
  }
  if (confirm.length) return { ok: false, message: "Onay gerekiyor", confirm };

  const r = await savePage(user, id, input, String(form.get("note") ?? "") || undefined);
  if (!r.ok) return { ok: false, message: r.error };
  if (r.changed.length) await audit(user.id, "page.update", "Page", id, { fields: r.changed });
  const analysis = await analyzeAndStore(id);
  if (analysis?.autoNoindex.noindex !== undefined) refreshPublic([input.path]);
  // Bir sayfadaki değişiklik başka sayfaların link/kopya analizini etkiler.
  after(() => runFullAnalysis().catch(() => {}));
  // Yayındaki (veya yayından kalkan) sayfayı arama motorlarına anında bildir.
  if (r.changed.length && (input.status === "PUBLISHED" || current.status === "PUBLISHED")) {
    const paths = [input.path, ...(current.path !== input.path ? [current.path] : [])];
    after(() => submitIndexNow(paths, fetch, { trigger: "publish" }).then(() => undefined, () => undefined));
  }
  return {
    ok: true,
    message: r.changed.length ? `Kaydedildi (${r.changed.length} alan değişti).` : "Değişiklik yok.",
    analysis,
  };
}

export async function analyzeDraftAction(_prev: EditorState, form: FormData): Promise<EditorState> {
  await requireUser("content");
  const id = String(form.get("id"));
  const { input, error } = formToInput(form);
  if (!input) return { ok: false, message: error ?? "Geçersiz veri" };
  const analysis = await analyzeUnsaved(id, input as never);
  return { ok: true, message: "Kaydedilmemiş hâli analiz edildi.", analysis };
}

export async function restoreVersionAction(form: FormData) {
  const user = await requireUser("content");
  const pageId = String(form.get("pageId"));
  const r = await restoreVersion(user, pageId, String(form.get("versionId")));
  if (r.ok) {
    await audit(user.id, "page.restore", "Page", pageId, { versionId: String(form.get("versionId")) });
    await analyzeAndStore(pageId);
  }
  redirect(`/yonetim/sayfalar/${pageId}?${r.ok ? "geri-yuklendi=1" : `hata=${encodeURIComponent(r.error)}`}`);
}

/** Hizmet+il, sektör+il, ilçe veya blog sayfası oluşturur. */
export async function createPageAction(form: FormData) {
  const user = await requireUser("content");
  const kind = String(form.get("kind"));
  const back = String(form.get("back") ?? "/yonetim/sayfalar");
  let r;
  if (kind === "service-location") {
    const [service, province] = await Promise.all([
      db.service.findUniqueOrThrow({ where: { id: String(form.get("serviceId")) } }),
      db.province.findUniqueOrThrow({ where: { id: Number(form.get("provinceId")) } }),
    ]);
    if (!service.allowLocationPages) redirect(`${back}?hata=${encodeURIComponent("Bu hizmet için şehir sayfası kapalı")}`);
    const path = `/${service.slug}/${province.slug}`;
    r = await createPage(user, {
      path, type: "SERVICE_LOCATION", name: `${province.name} ${service.name}`, breadcrumbLabel: province.name,
      h1: `${province.name} ${service.name}`, primaryKeyword: `${service.name} ${province.name}`.toLocaleLowerCase("tr-TR"),
      serviceId: service.id, provinceId: province.id,
    });
  } else if (kind === "sector-location") {
    const [sector, province, root] = await Promise.all([
      db.sector.findUniqueOrThrow({ where: { id: String(form.get("sectorId")) } }),
      db.province.findUniqueOrThrow({ where: { id: Number(form.get("provinceId")) } }),
      db.service.findUnique({ where: { slug: "web-tasarim" } }),
    ]);
    r = await createPage(user, {
      path: `/web-tasarim/${province.slug}/${sector.slug}`, type: "SECTOR_LOCATION",
      name: `${province.name} ${sector.name} Web Tasarımı`, breadcrumbLabel: sector.name,
      h1: `${province.name} ${sector.name} Web Tasarımı`,
      primaryKeyword: `${province.name} ${sector.name} web tasarımı`.toLocaleLowerCase("tr-TR"),
      sectorId: sector.id, provinceId: province.id, serviceId: root?.id,
    });
  } else if (kind === "blog") {
    const title = String(form.get("title") ?? "").trim();
    if (title.length < 5) redirect(`${back}?hata=${encodeURIComponent("Başlık en az 5 karakter olmalı")}`);
    r = await createPage(user, { path: `/blog/${slugify(title)}`, type: "BLOG_POST", name: title, h1: title, category: String(form.get("category") ?? "") || null });
  } else if (kind === "static") {
    const title = String(form.get("title") ?? "").trim();
    r = await createPage(user, { path: `/${slugify(String(form.get("slug") || title))}`, type: "STATIC", name: title, h1: title });
  } else {
    redirect(back);
  }
  if (!r.ok) redirect(`${back}?hata=${encodeURIComponent(r.error)}`);
  await audit(user.id, "page.create", "Page", r.pageId, { kind });
  redirect(`/yonetim/sayfalar/${r.pageId}`);
}
