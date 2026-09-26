import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { mediaUrl, type MediaVariant } from "@/lib/media/urls";
import { Badge, Card, Notice, PageTitle, inputCls } from "@/components/admin/ui";
import { deleteMediaAction, updateMediaAction, uploadMediaAction } from "./actions";

export const metadata = { title: "Medya" };

export default async function MediaLibrary(props: PageProps<"/yonetim/medya">) {
  await requireUser("media");
  const sp = await props.searchParams;
  const items = await db.media.findMany({ orderBy: { createdAt: "desc" } });
  const sel = items.find((m) => m.id === sp.id);
  return (
    <>
      <PageTitle title="Medya" desc="Yüklenen görseller WebP ve AVIF'e dönüştürülür, 640/1280/1920 px varyantları üretilir, konum bilgisi (EXIF) silinir. Dosya adını SEO'ya uygun verin: web-tasarim-sakarya." />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title="Yükle">
            <form action={uploadMediaAction} className="space-y-2">
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" required className="block w-full text-[13px]" />
              <input name="seoName" placeholder="Dosya adı (ör. web-tasarim-sakarya)" className={inputCls} />
              <input name="alt" placeholder="ALT metni (görsel ne gösteriyor?)" className={inputCls} />
              <input name="title" placeholder="Title" className={inputCls} />
              <input name="caption" placeholder="Açıklama (caption)" className={inputCls} />
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Yükle</button>
            </form>
          </Card>
          {sel && (
            <Card title={sel.filename}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(sel.filename)} alt={sel.alt ?? ""} className="mb-3 w-full rounded-lg" />
              <p className="mb-2 text-xs text-muted">{sel.width}×{sel.height} · {Math.round(sel.bytes / 1024)} KB · {(sel.variants as MediaVariant[]).length} varyant</p>
              <p className="mb-3 break-all text-xs">Markdown: <code>![{sel.alt ?? "alt metni"}]({mediaUrl(sel.filename)})</code></p>
              <form action={updateMediaAction} className="space-y-2">
                <input type="hidden" name="id" value={sel.id} />
                <label className="block text-[13px] font-medium">ALT<input name="alt" defaultValue={sel.alt ?? ""} className={inputCls} /></label>
                <label className="block text-[13px] font-medium">Title<input name="title" defaultValue={sel.title ?? ""} className={inputCls} /></label>
                <label className="block text-[13px] font-medium">Caption<input name="caption" defaultValue={sel.caption ?? ""} className={inputCls} /></label>
                <button className="rounded-full bg-ink px-4 py-1.5 text-paper">Kaydet</button>
              </form>
              <form action={deleteMediaAction} className="mt-3"><input type="hidden" name="id" value={sel.id} /><button className="text-xs text-bad underline">Sil (kullanımdaysa engellenir)</button></form>
            </Card>
          )}
        </div>
        <Card title={`${items.length} görsel`}>
          {items.length === 0 ? <p className="text-muted">Henüz görsel yok.</p> : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((m) => (
                <li key={m.id}>
                  <a href={`?id=${m.id}`} className={`block overflow-hidden rounded-xl border ${m.id === sel?.id ? "border-ink" : "border-line"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl((m.variants as MediaVariant[]).find((v) => v.width === 640 && v.format === "webp")?.file ?? m.filename)} alt={m.alt ?? ""} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    <div className="p-2 text-xs"><p className="truncate">{m.filename}</p>{!m.alt && <Badge tone="warn">ALT yok</Badge>}</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
