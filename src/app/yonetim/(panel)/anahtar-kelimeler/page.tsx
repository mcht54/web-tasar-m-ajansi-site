import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, Notice, PageTitle, Table, fmtDate, fmtNum, inputCls } from "@/components/admin/ui";
import { INTENT_LABELS } from "@/lib/admin/labels";
import { bulkKeywordsAction, deleteKeywordAction, saveKeywordAction } from "../seo-actions";

export const metadata = { title: "Anahtar Kelimeler" };

export default async function Keywords(props: PageProps<"/yonetim/anahtar-kelimeler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const editId = typeof sp.duzenle === "string" ? sp.duzenle : "";
  const [keywords, pages] = await Promise.all([
    db.keyword.findMany({
      orderBy: [{ priority: "desc" }, { phrase: "asc" }],
      include: { targetPage: { select: { path: true, status: true } }, province: { select: { name: true } }, district: { select: { name: true } }, service: { select: { name: true } }, sector: { select: { name: true } } },
    }),
    db.page.findMany({ where: { NOT: { status: "DRAFT", body: null, type: { in: ["CITY", "DISTRICT"] } } }, orderBy: { path: "asc" }, select: { id: true, path: true } }),
  ]);
  // Taslak il/ilçe sayfaları da hedef olabilir (sayfa yazılmadan önce kelime planlanır)
  const locationDrafts = await db.page.findMany({ where: { type: { in: ["CITY", "DISTRICT"] }, status: "DRAFT", body: null, keywords: { some: {} } }, select: { id: true, path: true } });
  const pageOptions = [...pages, ...locationDrafts].sort((a, b) => a.path.localeCompare(b.path));
  const edit = keywords.find((k) => k.id === editId);
  const change = (c: number | null, p: number | null) => {
    if (c == null || p == null) return <span className="text-muted">—</span>;
    const d = p - c;
    if (Math.abs(d) < 0.5) return <span className="text-muted">0</span>;
    return <span className={d > 0 ? "text-ok" : "text-bad"}>{d > 0 ? "▲" : "▼"} {fmtNum(Math.abs(d), 1)}</span>;
  };
  return (
    <>
      <PageTitle title="Anahtar Kelimeler" desc="Pozisyonlar Search Console'dan (sorgunun o günkü ortalama pozisyonu) gelir. Veri yoksa “—” gösterilir; tahmin yapılmaz." />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.{sp.eklenen ? ` ${sp.eklenen} eklendi, ${sp.atlanan} atlandı (zaten var / geçersiz).` : ""}</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={edit ? `Düzenle: ${edit.phrase}` : "Yeni anahtar kelime"}>
          <form action={saveKeywordAction} className="grid gap-3 sm:grid-cols-2" key={edit?.id ?? "new"}>
            <input type="hidden" name="id" value={edit?.id ?? ""} />
            <label className="text-[13px] font-medium sm:col-span-2">Kelime<input name="phrase" required defaultValue={edit?.phrase} className={inputCls} /></label>
            <label className="text-[13px] font-medium">Arama amacı
              <select name="intent" defaultValue={edit?.intent ?? "COMMERCIAL"} className={inputCls}>{Object.entries(INTENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="text-[13px] font-medium">Hedef URL
              <select name="targetPageId" defaultValue={edit?.targetPageId ?? ""} className={inputCls}><option value="">— yok —</option>{pageOptions.map((p) => <option key={p.id} value={p.id}>{p.path}</option>)}</select>
            </label>
            <label className="text-[13px] font-medium">Öncelik (1–5)<input name="priority" type="number" min={1} max={5} defaultValue={edit?.priority ?? 3} className={inputCls} /></label>
            <label className="text-[13px] font-medium">Hedef pozisyon<input name="targetPosition" type="number" min={1} max={100} defaultValue={edit?.targetPosition ?? ""} className={inputCls} /></label>
            <label className="text-[13px] font-medium">Durum
              <select name="status" defaultValue={edit?.status ?? "ACTIVE"} className={inputCls}><option value="ACTIVE">Takipte</option><option value="PAUSED">Durduruldu</option></select>
            </label>
            <label className="text-[13px] font-medium sm:col-span-2">Not<input name="notes" defaultValue={edit?.notes ?? ""} className={inputCls} /></label>
            <label className="flex items-center gap-2 text-[13px] font-medium sm:col-span-2"><input type="checkbox" name="seed" defaultChecked={edit?.source === "seed"} /> Otopilot seed kelimesi (başlangıç noktası; Durduruldu ise evren genişletmede kullanılmaz)</label>
            <p className="text-xs text-muted sm:col-span-2">Şehir, ilçe, hizmet ve sektör hedef sayfadan otomatik alınır.</p>
            <div className="flex gap-2 sm:col-span-2">
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Kaydet</button>
              {edit && <Link href="/yonetim/anahtar-kelimeler" className="rounded-full border border-line px-4 py-2">Vazgeç</Link>}
            </div>
          </form>
        </Card>
        <Card title="Toplu ekle">
          <form action={bulkKeywordsAction} className="space-y-3">
            <textarea name="lines" rows={8} className={inputCls} placeholder={"web tasarım bursa ; /web-tasarim/bursa\nkurumsal web sitesi fiyatları\n…"} />
            <div className="flex gap-2">
              <select name="intent" className={`${inputCls} mt-0 max-w-xs`}>{Object.entries(INTENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-[13px]"><input type="checkbox" name="seed" /> seed</label>
              <button className="rounded-full bg-ink px-4 text-paper">Ekle</button>
            </div>
            <p className="text-xs text-muted">Her satır bir kelime; isteğe bağlı olarak “;” sonrası hedef URL yolu.</p>
          </form>
        </Card>
      </div>
      <div className="mt-6">
        <Card title={`${keywords.length} anahtar kelime`}>
          <Table head={["Kelime", "Amaç", "Hedef URL", "Konum / hizmet", "Öncelik", "Hedef", "Mevcut", "Önceki", "Değişim", "Son kontrol", "SERP URL", "Durum", ""]}>
            {keywords.map((k) => (
              <tr key={k.id}>
                <td><Link href={`/yonetim/siralama/${k.id}`} className="font-medium hover:underline">{k.phrase}</Link>{k.source === "seed" ? <> <Badge tone="ok">seed</Badge></> : k.source === "competitor" ? <> <Badge>rakip sinyali</Badge></> : k.source === "universe" ? <> <Badge>evren</Badge></> : null}</td>
                <td>{INTENT_LABELS[k.intent]}</td>
                <td className="text-xs">{k.targetPage ? <>{k.targetPage.path}{k.targetPage.status !== "PUBLISHED" && <Badge tone="warn">taslak</Badge>}</> : "—"}</td>
                <td className="text-xs text-muted">{[k.province?.name, k.district?.name, k.service?.name, k.sector?.name].filter(Boolean).join(" · ") || "—"}</td>
                <td>{k.priority}</td>
                <td>{k.targetPosition ?? "—"}</td>
                <td className="tabular-nums">{k.currentPosition != null ? fmtNum(k.currentPosition, 1) : "—"}</td>
                <td className="tabular-nums">{k.previousPosition != null ? fmtNum(k.previousPosition, 1) : "—"}</td>
                <td>{change(k.currentPosition, k.previousPosition)}</td>
                <td className="whitespace-nowrap">{fmtDate(k.lastCheckedAt)}</td>
                <td className="max-w-40 truncate text-xs">{k.serpUrl ?? "—"}</td>
                <td>{k.status === "ACTIVE" ? <Badge tone="ok">Takipte</Badge> : <Badge>Durduruldu</Badge>}</td>
                <td className="whitespace-nowrap">
                  <Link href={`?duzenle=${k.id}`} className="text-xs underline">Düzenle</Link>{" "}
                  <form action={deleteKeywordAction} className="inline"><input type="hidden" name="id" value={k.id} /><button className="text-xs text-bad underline">Sil</button></form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
