"use client";

import { startTransition, useActionState, useState } from "react";
import { analyzeDraftAction, savePageAction, type EditorState } from "@/app/yonetim/(panel)/sayfalar/actions";
import { AnalysisPanel } from "./AnalysisPanel";
import type { PageAnalysis } from "@/lib/seo/analyzer";

export type EditorPage = {
  id: string; path: string; type: string; status: string; name: string; breadcrumbLabel: string; seoTitle: string;
  metaDescription: string; h1: string; intro: string; body: string; faq: { q: string; a: string }[]; canonical: string;
  robotsIndex: boolean; robotsFollow: boolean; ogTitle: string; ogDescription: string; ogImageId: string;
  schemaDisabled: string[]; primaryKeyword: string; secondaryKeywords: string[]; excerpt: string; category: string; authorName: string;
};

type Props = {
  page: EditorPage;
  canSeo: boolean;
  siteUrl: string;
  titleTemplate: string;
  defaultTitle: string;
  media: { id: string; filename: string }[];
  schemaTypes: string[];
  analysis: PageAnalysis | null;
  gate?: { ready: boolean; score: number; items: { key: string; label: string; status: string; critical: boolean; note: string }[] } | null;
};

const inp = "mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-ink disabled:opacity-60";

function Counter({ n, min, max }: { n: number; min: number; max: number }) {
  const tone = n === 0 ? "text-muted" : n < min || n > max ? "text-warn" : "text-ok";
  return <span className={`text-xs tabular-nums ${tone}`}>{n} karakter (ideal {min}–{max})</span>;
}

export function PageEditor({ page, canSeo, siteUrl, titleTemplate, defaultTitle, media, schemaTypes, analysis, gate }: Props) {
  const publishBlocked = Boolean(gate && !gate.ready && page.status !== "PUBLISHED");
  const [saveState, saveAction, saving] = useActionState<EditorState, FormData>(savePageAction, { ok: false, message: "" });
  const [anState, anAction, analyzing] = useActionState<EditorState, FormData>(analyzeDraftAction, { ok: false, message: "" });
  const [f, setF] = useState(page);
  const [faq, setFaq] = useState(page.faq.length ? page.faq : []);
  // React form eylemi sonrası kontrolsüz alanları sıfırlar; tüm alanlar kontrollü tutulur.
  const [secondary, setSecondary] = useState(page.secondaryKeywords.join(", "));
  const [note, setNote] = useState("");
  const set = (k: keyof EditorPage) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const resolvedTitle = f.seoTitle.trim() || (f.type === "HOME" ? defaultTitle : titleTemplate.replace("%page%", f.name));
  const resolvedDesc = f.metaDescription.trim() || f.intro.trim().slice(0, 158);
  const shownAnalysis = anState.analysis ?? saveState.analysis ?? analysis;
  const state = saveState.message ? saveState : anState;
  const isBlog = f.type === "BLOG_POST";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          // Eylemi elle çağırıyoruz: <form action> kullanılsaydı React gönderim sonrası
          // formu sıfırlar, kontrollü checkbox'ların DOM değeri state'ten ayrışırdı.
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const analyze = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-analyze") === "1";
          startTransition(() => (analyze ? anAction(fd) : saveAction(fd)));
        }}
      >
        <input type="hidden" name="id" value={f.id} />
        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Yayın</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-[13px] font-medium">Durum
              <select name="status" value={f.status} onChange={set("status")} className={inp}>
                <option value="DRAFT">Taslak (ziyaretçiye 404)</option>
                <option value="PUBLISHED" disabled={publishBlocked}>{publishBlocked ? "Yayında (YAYINA HAZIR DEĞİL)" : "Yayında"}</option>
                <option value="ARCHIVED">Arşiv</option>
              </select>
            </label>
            <label className="text-[13px] font-medium sm:col-span-2">URL {!canSeo && <span className="text-muted">(SEO yetkisi gerekir)</span>}
              <input name="path" value={f.path} onChange={set("path")} readOnly={!canSeo || f.type === "HOME"} className={inp} />
              {f.path !== page.path && page.status === "PUBLISHED" && <span className="mt-1 block text-xs text-warn">Kaydedince {page.path} → {f.path} için otomatik 301 yönlendirme oluşturulur.</span>}
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">İçerik</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium">Sayfa adı (şablon başlığı ve bağlantı metni)
              <input name="name" value={f.name} onChange={set("name")} className={inp} required />
            </label>
            <label className="text-[13px] font-medium">Breadcrumb etiketi
              <input name="breadcrumbLabel" value={f.breadcrumbLabel} onChange={set("breadcrumbLabel")} className={inp} placeholder={f.name} />
            </label>
          </div>
          <label className="block text-[13px] font-medium">H1
            <input name="h1" value={f.h1} onChange={set("h1")} className={inp} />
          </label>
          <label className="block text-[13px] font-medium">Giriş paragrafı (ana anahtar kelime burada geçmeli)
            <textarea name="intro" value={f.intro} onChange={set("intro")} rows={3} className={inp} />
          </label>
          <label className="block text-[13px] font-medium">İçerik (Markdown: ## H2, ### H3, [bağlantı](/url), ![alt metin](/medya/dosya.webp))
            <textarea name="body" value={f.body} onChange={set("body")} rows={22} className={`${inp} font-mono text-[13px] leading-relaxed`} />
          </label>
          {isBlog && (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-[13px] font-medium">Kategori<input name="category" value={f.category} onChange={set("category")} className={inp} /></label>
              <label className="text-[13px] font-medium">Yazar (boşsa kurum)<input name="authorName" value={f.authorName} onChange={set("authorName")} className={inp} /></label>
              <label className="text-[13px] font-medium">Özet<input name="excerpt" value={f.excerpt} onChange={set("excerpt")} className={inp} /></label>
            </div>
          )}
          {!isBlog && <><input type="hidden" name="category" value={f.category} /><input type="hidden" name="authorName" value={f.authorName} /><input type="hidden" name="excerpt" value={f.excerpt} /></>}
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sık sorulan sorular</h2>
            <button type="button" onClick={() => setFaq([...faq, { q: "", a: "" }])} className="rounded-full border border-line px-3 py-1 text-xs">+ Soru ekle</button>
          </div>
          <p className="text-xs text-muted">En az 2 soru girilirse FAQPage schema otomatik üretilir. Sorular sayfada görünür.</p>
          {faq.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
              <input name="faq_q" value={item.q} onChange={(e) => setFaq(faq.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)))} placeholder="Soru" className={inp} />
              <textarea name="faq_a" value={item.a} onChange={(e) => setFaq(faq.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} placeholder="Yanıt" rows={2} className={inp} />
              <button type="button" onClick={() => setFaq(faq.filter((_, k) => k !== i))} className="justify-self-end text-xs text-bad">Kaldır</button>
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">SEO</h2>
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="text-xs text-muted">Google önizlemesi</p>
            <p className="mt-1 truncate text-xs text-ink-soft">{siteUrl.replace(/^https?:\/\//, "")}{f.path === "/" ? "" : f.path.replaceAll("/", " › ")}</p>
            <p className="truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{resolvedTitle.length > 60 ? `${resolvedTitle.slice(0, 58)}…` : resolvedTitle}</p>
            <p className="line-clamp-2 text-[13px] text-ink-soft">{resolvedDesc.length > 160 ? `${resolvedDesc.slice(0, 157)}…` : resolvedDesc || "Açıklama yok"}</p>
          </div>
          <label className="block text-[13px] font-medium">SEO title (boşsa şablon: “{titleTemplate}”)
            <input name="seoTitle" value={f.seoTitle} onChange={set("seoTitle")} className={inp} placeholder={resolvedTitle} />
            <Counter n={resolvedTitle.length} min={30} max={60} />
          </label>
          <label className="block text-[13px] font-medium">Meta description
            <textarea name="metaDescription" value={f.metaDescription} onChange={set("metaDescription")} rows={2} className={inp} />
            <Counter n={f.metaDescription.length} min={110} max={160} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium">Ana anahtar kelime
              <input name="primaryKeyword" value={f.primaryKeyword} onChange={set("primaryKeyword")} className={inp} />
            </label>
            <label className="text-[13px] font-medium">İkincil / semantik kelimeler (virgülle)
              <input name="secondaryKeywords" value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inp} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-[13px] font-medium">OG title<input name="ogTitle" value={f.ogTitle} onChange={set("ogTitle")} className={inp} /></label>
            <label className="text-[13px] font-medium sm:col-span-2">OG description<input name="ogDescription" value={f.ogDescription} onChange={set("ogDescription")} className={inp} /></label>
          </div>
          <label className="block text-[13px] font-medium">OG görseli
            <select name="ogImageId" value={f.ogImageId} onChange={set("ogImageId")} className={inp}>
              <option value="">— Varsayılan —</option>
              {media.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}
            </select>
          </label>
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Teknik {!canSeo && <span className="text-xs font-normal text-muted">(yalnızca SEO Uzmanı / Yönetici değiştirebilir)</span>}</h2>
          <fieldset disabled={!canSeo} className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2"><input type="checkbox" name="robotsIndex" checked={f.robotsIndex} onChange={(e) => setF({ ...f, robotsIndex: e.target.checked })} /> INDEX</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="robotsFollow" checked={f.robotsFollow} onChange={(e) => setF({ ...f, robotsFollow: e.target.checked })} /> FOLLOW</label>
            </div>
            {!f.robotsIndex && <p className="rounded-lg bg-warn/10 px-3 py-2 text-warn">NOINDEX seçili: sayfa Google sonuçlarından çıkar ve sitemap&apos;e girmez. Bilinçli değilse işareti geri koyun.</p>}
            <label className="block text-[13px] font-medium">Canonical (boşsa sayfanın kendi URL&apos;si)
              <input name="canonical" value={f.canonical} onChange={set("canonical")} className={inp} placeholder={`${siteUrl}${f.path === "/" ? "/" : f.path}`} />
            </label>
            <div>
              <p className="text-[13px] font-medium">Otomatik schema türleri — kapatmak istediklerinizi işaretleyin</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {schemaTypes.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="schemaDisabled" value={t} checked={f.schemaDisabled.includes(t)} onChange={(e) => setF({ ...f, schemaDisabled: e.target.checked ? [...f.schemaDisabled, t] : f.schemaDisabled.filter((x) => x !== t) })} /> {t}</label>
                ))}
              </div>
            </div>
          </fieldset>
          {!canSeo && (
            <>
              {f.robotsIndex && <input type="hidden" name="robotsIndex" value="on" />}
              {f.robotsFollow && <input type="hidden" name="robotsFollow" value="on" />}
              {f.schemaDisabled.map((s) => <input key={s} type="hidden" name="schemaDisabled" value={s} />)}
            </>
          )}
        </section>

        <div className="sticky bottom-0 z-10 -mx-2 space-y-3 rounded-2xl border border-line bg-card/95 p-4 backdrop-blur">
          {saveState.confirm?.map((c) => (
            <label key={c.key} className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-warn">
              <input type="checkbox" name={c.key} className="mt-1" /> <span>{c.text}</span>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <input name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Değişiklik notu (isteğe bağlı)" className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2" />
            <button data-analyze="1" disabled={analyzing} className="rounded-full border border-line px-4 py-2 font-semibold">{analyzing ? "Analiz…" : "Kaydetmeden analiz et"}</button>
            <button disabled={saving} className="rounded-full bg-ink px-5 py-2 font-semibold text-paper">{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
          {state.message && <p role="status" className={state.ok ? "text-ok" : "text-bad"}>{state.message}</p>}
        </div>
      </form>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        {gate && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Lokasyon kalite kapısı</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gate.ready ? "bg-ok/15 text-ok" : "bg-bad/15 text-bad"}`}>{gate.ready ? "YAYINA HAZIR" : "YAYINA HAZIR DEĞİL"} · {gate.score}</span>
            </div>
            <ul className="space-y-1 text-[13px]">
              {gate.items.map((i) => (
                <li key={i.key} className="flex gap-2">
                  <span className={`w-12 shrink-0 font-mono text-xs font-semibold ${i.status === "PASS" ? "text-ok" : i.status === "WARN" ? "text-warn" : "text-bad"}`}>{i.status}</span>
                  <span><span className="font-medium">{i.label}</span>{i.critical ? "" : " (bilgi)"} <span className="text-muted">— {i.note}</span></span>
                </li>
              ))}
            </ul>
            {!gate.ready && <p className="mt-3 text-xs text-muted">Kritik kontrollerin hepsi geçmeden sayfa yayınlanamaz. Kaydettikten sonra kapı yeniden hesaplanır.</p>}
          </section>
        )}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="mb-4 font-semibold">SEO analizi {anState.analysis && <span className="text-xs font-normal text-warn">(kaydedilmemiş hâl)</span>}</h2>
          <AnalysisPanel a={shownAnalysis} />
        </section>
      </aside>
    </div>
  );
}
