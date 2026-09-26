import { generateFixAction } from "@/app/yonetim/(panel)/ai-asistan/fix-actions";

/** ÇÖZÜM ÖNER: fırsat bağlamıyla (sayfa + sorgu) öneri üretir. */
export function FixButton({ pageId, query, category, back, small }: { pageId: string | null | undefined; query?: string | null; category?: string | null; back: string; small?: boolean }) {
  if (!pageId) return <span className="text-xs text-muted">Önce sayfa oluşturulmalı</span>;
  return (
    <form action={generateFixAction}>
      <input type="hidden" name="pageId" value={pageId} />
      {query && <input type="hidden" name="query" value={query} />}
      {category && <input type="hidden" name="category" value={category} />}
      <input type="hidden" name="back" value={back} />
      <button className={`rounded-full bg-accent font-semibold text-accent-ink ${small ? "px-3 py-1 text-xs" : "px-4 py-2 text-[13px]"}`}>ÇÖZÜM ÖNER</button>
    </form>
  );
}
