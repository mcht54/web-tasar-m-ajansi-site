"use client";

import { startTransition, useActionState, useState } from "react";
import { applyFixAction, type FixApplyState } from "@/app/yonetim/(panel)/ai-asistan/fix-actions";

type Props = {
  id: string;
  path: string;
  siteUrl: string;
  current: { seoTitle: string; metaDescription: string; h1: string };
  proposed: { seoTitle: string; metaDescription: string; h1: string; faq: { q: string; a: string }[] };
  pending: boolean;
};

const inp = "w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-ink";
const MARK = /\[DOĞRULANMALI/;

function Count({ n, min, max }: { n: number; min: number; max: number }) {
  return <span className={`text-xs ${n < min || n > max ? "text-warn" : "text-ok"}`}>{n} karakter (ideal {min}–{max})</span>;
}

export function FixReview({ id, path, siteUrl, current, proposed, pending }: Props) {
  const [state, action, busy] = useActionState<FixApplyState, FormData>(applyFixAction, { ok: false, message: "" });
  const [v, setV] = useState({ seoTitle: proposed.seoTitle, metaDescription: proposed.metaDescription, h1: proposed.h1 });
  const [use, setUse] = useState({
    seoTitle: proposed.seoTitle !== current.seoTitle && !MARK.test(proposed.seoTitle),
    metaDescription: proposed.metaDescription !== current.metaDescription && !MARK.test(proposed.metaDescription),
    h1: proposed.h1 !== current.h1 && !MARK.test(proposed.h1),
  });
  const [faq, setFaq] = useState(proposed.faq.map((f) => ({ ...f, use: false })));
  const [preview, setPreview] = useState(false);
  const rows: { key: "seoTitle" | "metaDescription" | "h1"; label: string; min: number; max: number }[] = [
    { key: "seoTitle", label: "Title", min: 30, max: 60 },
    { key: "metaDescription", label: "Meta description", min: 110, max: 160 },
    { key: "h1", label: "H1", min: 10, max: 90 },
  ];
  const shown = (k: "seoTitle" | "metaDescription" | "h1") => (use[k] ? v[k] : current[k]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={id} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Alan</th><th className="p-2">MEVCUT</th><th className="p-2">ÖNERİLEN (düzenlenebilir)</th><th className="p-2">Uygula</th></tr></thead>
          <tbody className="divide-y divide-line align-top">
            {rows.map((r) => {
              const changed = v[r.key] !== current[r.key];
              return (
                <tr key={r.key}>
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-muted">{current[r.key] || <i>boş</i>}<div><Count n={current[r.key].length} min={r.min} max={r.max} /></div></td>
                  <td className="p-2">
                    <textarea name={r.key} value={v[r.key]} disabled={!pending} rows={r.key === "metaDescription" ? 3 : 2}
                      onChange={(e) => setV({ ...v, [r.key]: e.target.value })}
                      className={`${inp} ${changed ? "border-accent" : ""} ${MARK.test(v[r.key]) ? "bg-warn/10" : ""}`} />
                    <Count n={v[r.key].length} min={r.min} max={r.max} />
                    {MARK.test(v[r.key]) && <span className="ml-2 text-xs text-bad">[DOĞRULANMALI] — gerçek bilgiyle düzenlemeden uygulanamaz</span>}
                  </td>
                  <td className="p-2"><input type="checkbox" name={`use_${r.key}`} checked={use[r.key]} disabled={!pending} onChange={(e) => setUse({ ...use, [r.key]: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {faq.length > 0 && (
        <div>
          <p className="mb-2 font-semibold">Önerilen SSS (eklemek için işaretleyin ve yanıtı gerçek bilgiyle yazın)</p>
          {faq.map((f, i) => (
            <div key={i} className="mb-2 grid gap-2 rounded-xl border border-line p-3">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="faq_use" value={i} checked={f.use} disabled={!pending} onChange={(e) => setFaq(faq.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))} /> Ekle</label>
              <input name={`faq_q_${i}`} value={f.q} disabled={!pending} onChange={(e) => setFaq(faq.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)))} className={inp} />
              <textarea name={`faq_a_${i}`} value={f.a} rows={2} disabled={!pending} onChange={(e) => setFaq(faq.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} className={`${inp} ${MARK.test(f.a) ? "bg-warn/10" : ""}`} />
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="rounded-xl border border-line bg-paper p-4">
          <p className="text-xs text-muted">Önizleme — Google sonucu (seçili alanlarla)</p>
          <p className="mt-1 truncate text-xs text-ink-soft">{siteUrl.replace(/^https?:\/\//, "")}{path === "/" ? "" : path.replaceAll("/", " › ")}</p>
          <p className="truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{shown("seoTitle")}</p>
          <p className="line-clamp-2 text-[13px] text-ink-soft">{shown("metaDescription")}</p>
          <p className="mt-3 text-xs text-muted">Sayfa başlığı (H1)</p>
          <p className="font-display text-2xl">{shown("h1")}</p>
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPreview(!preview)} className="rounded-full border border-line px-4 py-2">{preview ? "Önizlemeyi kapat" : "Önizle"}</button>
          <button disabled={busy} className="rounded-full bg-ink px-5 py-2 font-semibold text-paper">{busy ? "Uygulanıyor…" : "Uygula"}</button>
          <span className="text-xs text-muted">Düzenle: önerilen alanları yukarıda değiştirebilirsiniz. Uygulanan değişiklik sürüm geçmişine yazılır ve geri alınabilir.</span>
        </div>
      )}
      {state.message && <p role="alert" className={state.ok ? "text-ok" : "text-bad"}>{state.message}</p>}
    </form>
  );
}
