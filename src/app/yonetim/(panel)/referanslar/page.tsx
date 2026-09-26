import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { refreshPublic } from "@/lib/admin/pages";
import { Badge, Card, Notice, PageTitle, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Referanslar" };

async function saveReference(form: FormData) {
  "use server";
  const user = await requireUser("content");
  const id = String(form.get("id") ?? "");
  const s = (k: string, max = 300) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const url = s("url");
  if (url && !/^https?:\/\//.test(url)) redirect(`/yonetim/referanslar?hata=${encodeURIComponent("URL http(s) ile başlamalı")}`);
  const data = {
    name: s("name", 120) ?? "İsimsiz", url, description: s("description", 600), city: s("city", 60),
    sectorId: s("sectorId"), imageId: s("imageId"), published: form.get("published") === "on", sortOrder: Number(form.get("sortOrder")) || 0,
  };
  if (id) await db.reference.update({ where: { id }, data });
  else await db.reference.create({ data });
  await audit(user.id, "reference.save", "Reference", id || data.name);
  refreshPublic();
  redirect("/yonetim/referanslar?kaydedildi=1");
}

async function deleteReference(form: FormData) {
  "use server";
  const user = await requireUser("content");
  const id = String(form.get("id"));
  await db.reference.delete({ where: { id } });
  await audit(user.id, "reference.delete", "Reference", id);
  refreshPublic();
  redirect("/yonetim/referanslar");
}

export default async function References(props: PageProps<"/yonetim/referanslar">) {
  await requireUser("content");
  const sp = await props.searchParams;
  const [refs, sectors, media] = await Promise.all([
    db.reference.findMany({ orderBy: { sortOrder: "asc" }, include: { sector: true } }),
    db.sector.findMany({ orderBy: { sortOrder: "asc" } }),
    db.media.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, filename: true } }),
  ]);
  const edit = refs.find((r) => r.id === sp.duzenle);
  return (
    <>
      <PageTitle title="Referanslar" desc="Yalnızca gerçek ve müşterinin izin verdiği işler. Yayında referans yoksa sitede referans bölümü hiç gösterilmez." />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card title={edit ? "Referansı düzenle" : "Yeni referans"}>
          <form action={saveReference} className="space-y-2" key={edit?.id ?? "new"}>
            <input type="hidden" name="id" value={edit?.id ?? ""} />
            <input name="name" required defaultValue={edit?.name} placeholder="Müşteri / proje adı" className={inputCls} />
            <input name="url" defaultValue={edit?.url ?? ""} placeholder="https://…" className={inputCls} />
            <textarea name="description" defaultValue={edit?.description ?? ""} placeholder="Ne yapıldı? (kısa, somut)" rows={3} className={inputCls} />
            <input name="city" defaultValue={edit?.city ?? ""} placeholder="Şehir" className={inputCls} />
            <select name="sectorId" defaultValue={edit?.sectorId ?? ""} className={inputCls}><option value="">Sektör seçin</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select name="imageId" defaultValue={edit?.imageId ?? ""} className={inputCls}><option value="">Görsel (Medya&apos;dan)</option>{media.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}</select>
            <div className="flex items-center gap-4 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={edit?.published} /> Yayında (müşteri izni alındı)</label>
              <label>Sıra <input name="sortOrder" type="number" defaultValue={edit?.sortOrder ?? 0} className="w-16 rounded border border-line bg-paper px-2 py-1" /></label>
            </div>
            <button className="rounded-full bg-ink px-4 py-2 text-paper">Kaydet</button>
          </form>
        </Card>
        <Card>
          <Table head={["Ad", "Sektör", "Şehir", "Durum", ""]} empty="Referans yok.">
            {refs.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{r.sector?.name ?? "—"}</td><td>{r.city ?? "—"}</td>
                <td>{r.published ? <Badge tone="ok">Yayında</Badge> : <Badge>Taslak</Badge>}</td>
                <td className="whitespace-nowrap"><a href={`?duzenle=${r.id}`} className="text-xs underline">Düzenle</a>{" "}
                  <form action={deleteReference} className="inline"><input type="hidden" name="id" value={r.id} /><button className="text-xs text-bad underline">Sil</button></form></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
