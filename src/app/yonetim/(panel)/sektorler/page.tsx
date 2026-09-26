import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, Notice, PageTitle, ScoreBadge, Table, inputCls } from "@/components/admin/ui";
import { createPageAction } from "../sayfalar/actions";

export const metadata = { title: "Sektörler" };

export default async function Sectors(props: PageProps<"/yonetim/sektorler">) {
  await requireUser("content");
  const sp = await props.searchParams;
  const [sectors, provinces] = await Promise.all([
    db.sector.findMany({ orderBy: { sortOrder: "asc" }, include: { pages: { select: { id: true, path: true, type: true, status: true, seoScore: true } }, _count: { select: { references: true } } } }),
    db.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageTitle title="Sektörler" desc="Sektör sayfaları ve sektör + şehir kombinasyonları (/web-tasarim/{il}/{sektör}). Kombinasyonlar yalnızca o şehirdeki sektöre özgü içerikle yayınlanmalı." />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {sectors.map((s) => {
          const main = s.pages.find((p) => p.type === "SECTOR");
          const combos = s.pages.filter((p) => p.type === "SECTOR_LOCATION");
          return (
            <Card key={s.id} title={s.name} actions={main && <Link href={`/yonetim/sayfalar/${main.id}`} className="text-xs underline">{main.path}</Link>}>
              <p className="mb-3 text-xs text-muted">Ana sayfa SEO: <ScoreBadge score={main?.seoScore} /> · {s._count.references} referans</p>
              <form action={createPageAction} className="mb-3 flex gap-2">
                <input type="hidden" name="kind" value="sector-location" />
                <input type="hidden" name="sectorId" value={s.id} />
                <input type="hidden" name="back" value="/yonetim/sektorler" />
                <select name="provinceId" className={`${inputCls} mt-0`} required>
                  {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="whitespace-nowrap rounded-full border border-line px-3 text-[13px]">+ Şehir sayfası</button>
              </form>
              <Table head={["Kombinasyon", "Durum", "SEO"]} empty="Kombinasyon yok.">
                {combos.map((c) => (
                  <tr key={c.id}><td><Link href={`/yonetim/sayfalar/${c.id}`} className="hover:underline">{c.path}</Link></td><td>{c.status === "PUBLISHED" ? "Yayında" : "Taslak"}</td><td><ScoreBadge score={c.seoScore} /></td></tr>
                ))}
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
