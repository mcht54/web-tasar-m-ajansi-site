import type { PageAnalysis } from "@/lib/seo/analyzer";
import { CATEGORY_LABELS, type Category } from "@/lib/seo/score";

const STATUS_STYLE: Record<string, string> = {
  PASS: "text-ok", WARN: "text-warn", WARNING: "text-warn", FAIL: "text-bad", NA: "text-muted",
};
const STATUS_TEXT: Record<string, string> = { PASS: "PASS", WARN: "UYARI", WARNING: "WARNING", FAIL: "FAIL", NA: "Ölçülmedi" };

export function AnalysisPanel({ a }: { a: PageAnalysis | null | undefined }) {
  if (!a) return <p className="text-muted">Bu sayfa henüz analiz edilmedi. İçerik girip kaydedin veya “Kaydetmeden analiz et”e basın.</p>;
  const tone = (s: number) => (s >= 80 ? "text-ok" : s >= 60 ? "text-warn" : "text-bad");
  return (
    <div className="space-y-6">
      <div className="flex items-end gap-6">
        <div>
          <p className="text-xs text-muted">SEO SCORE</p>
          <p className={`text-4xl font-semibold tabular-nums ${tone(a.seo.score)}`}>{a.seo.score}<span className="text-lg text-muted">/100</span></p>
        </div>
        <div>
          <p className="text-xs text-muted">İçerik kalitesi</p>
          <p className={`text-2xl font-semibold tabular-nums ${tone(a.quality.score)}`}>{a.quality.score}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Kelime</p>
          <p className="text-2xl font-semibold tabular-nums">{a.seo.wordCount}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 font-semibold">Google&apos;a gönderilmeye hazır mı?</p>
        <ul className="space-y-1">
          {a.readiness.items.map((i) => (
            <li key={i.label} className="flex gap-3">
              <span className={`w-20 shrink-0 font-mono text-xs font-semibold ${STATUS_STYLE[i.status]}`}>{i.status}</span>
              <span><span className="font-medium">{i.label}</span> <span className="text-muted">— {i.note}</span></span>
            </li>
          ))}
        </ul>
        {a.autoNoindex.noindex && (
          <p className="mt-2 rounded-lg bg-bad/10 px-3 py-2 text-bad">Otomatik NOINDEX: {a.autoNoindex.reason}</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
          const v = a.seo.categories[c];
          const pct = v.max ? (v.points / v.max) * 100 : 0;
          return (
            <div key={c}>
              <div className="flex justify-between text-xs"><span>{CATEGORY_LABELS[c]}</span><span className="tabular-nums text-muted">{v.max ? `${v.points}/${v.max}` : "ölçülmedi"}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Skor yalnızca ölçülebilen kriterlerden hesaplanır: Teknik 25 (indekslenebilirlik, canonical, URL, kopya içerik, cannibalization) · İçerik 25 (uzunluk, ana kelime girişte, ikincil kelimeler, H2/H3, keyword stuffing) · Sayfa içi 20 (title, H1, meta) · İç link 10 · Performans 10 (yalnızca crawler ölçtüyse) · Yapısal veri 5 · UX 5. Google sıralaması, tahmini trafik veya arama hacmi skora girmez. Ölçülemeyen kriter toplamdan düşülür; kritik sorunlar skora tavan koyar.
      </p>
      <details open>
        <summary className="font-semibold">Kontroller ({a.seo.checks.filter((c) => c.status === "FAIL" || c.status === "WARN").length} sorun)</summary>
        <ul className="mt-2 divide-y divide-line">
          {[...a.seo.checks].sort((x, y) => order(x.status) - order(y.status)).map((c) => (
            <li key={c.id} className="flex gap-3 py-1.5">
              <span className={`w-20 shrink-0 font-mono text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{STATUS_TEXT[c.status]}</span>
              <span className="flex-1"><span className="font-medium">{c.label}</span> <span className="text-muted">— {c.message}</span></span>
              <span className="tabular-nums text-xs text-muted">{c.status === "NA" ? "" : `${c.points}/${c.max}`}</span>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="font-semibold">İçerik kalite skoru ayrıntısı</summary>
        <ul className="mt-2 space-y-1">
          {a.quality.parts.map((p) => (
            <li key={p.label} className="flex justify-between gap-3"><span>{p.label} <span className="text-muted">— {p.note}</span></span><span className="tabular-nums text-muted">{p.max ? `${p.points}/${p.max}` : ""}</span></li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="font-semibold">Schema ({a.schemaTypes.join(", ")})</summary>
        {a.schemaIssues.length ? (
          <ul className="mt-2 list-disc pl-5">{a.schemaIssues.map((i, k) => <li key={k} className={i.level === "error" ? "text-bad" : "text-warn"}>{i.type}: {i.message}</li>)}</ul>
        ) : <p className="mt-2 text-ok">Sorun yok.</p>}
      </details>
      <p className="text-xs text-muted">
        Gelen bağlamsal link: {a.inlinks}{a.potentialInlinks ? " (yayınlanınca)" : ""} · Menü linki: {a.navInlinks} · Giden: {a.outlinks}
        {a.similar.path && ` · En benzer sayfa: ${a.similar.path} (%${Math.round(a.similar.score * 100)})`}
      </p>
    </div>
  );
}

function order(s: string) {
  return s === "FAIL" ? 0 : s === "WARN" ? 1 : s === "PASS" ? 2 : 3;
}
