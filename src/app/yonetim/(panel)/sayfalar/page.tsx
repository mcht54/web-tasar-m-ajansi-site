import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, Card, PageTitle, Pagination, ScoreBadge, Table, fmtDate, inputCls } from "@/components/admin/ui";
import { PAGE_TYPE_LABELS, STATUS_LABELS } from "@/lib/admin/labels";

export const metadata = { title: "Sayfalar" };
const SIZE = 50;

export default async function PagesList(props: PageProps<"/yonetim/sayfalar">) {
  await requireUser("content");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.tur === "string" ? sp.tur : "";
  const status = typeof sp.durum === "string" ? sp.durum : "";
  const page = Math.max(1, Number(sp.s) || 1);
  const where: Prisma.PageWhereInput = {
    ...(q ? { OR: [{ path: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(type ? { type: type as Prisma.EnumPageTypeFilter["equals"] } : {}),
    ...(status ? { status: status as Prisma.EnumPageStatusFilter["equals"] } : {}),
    // İçeriksiz il/ilçe taslakları varsayılan listede kalabalık yapmasın
    ...(!type && !status && !q ? { NOT: { status: "DRAFT", body: null, type: { in: ["CITY", "DISTRICT"] } } } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.page.findMany({ where, orderBy: [{ type: "asc" }, { path: "asc" }], skip: (page - 1) * SIZE, take: SIZE,
      select: { id: true, path: true, name: true, type: true, status: true, seoScore: true, contentScore: true, robotsIndex: true, autoNoindex: true, updatedAt: true } }),
    db.page.count({ where }),
    db.page.groupBy({ by: ["status"], _count: true }),
  ]);
  const href = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(type && { tur: type }), ...(status && { durum: status }), s: String(p) })}`;
  return (
    <>
      <PageTitle
        title="Sayfalar"
        desc={`Toplam ${counts.reduce((s, c) => s + c._count, 0)} sayfa · ${counts.map((c) => `${STATUS_LABELS[c.status]}: ${c._count}`).join(" · ")}. İçeriksiz il/ilçe taslakları filtre seçilmedikçe gizlenir.`}
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="URL veya ad ara" className={`${inputCls} mt-0 max-w-xs`} />
          <select name="tur" defaultValue={type} className={`${inputCls} mt-0 max-w-[200px]`}>
            <option value="">Tüm türler</option>
            {Object.entries(PAGE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="durum" defaultValue={status} className={`${inputCls} mt-0 max-w-[160px]`}>
            <option value="">Tüm durumlar</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-full bg-ink px-4 text-paper">Filtrele</button>
        </form>
        <Table head={["Sayfa", "Tür", "Durum", "Index", "SEO", "İçerik", "Güncelleme"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/yonetim/sayfalar/${r.id}`} className="font-medium hover:underline">{r.name}</Link><div className="text-xs text-muted">{r.path}</div></td>
              <td>{PAGE_TYPE_LABELS[r.type]}</td>
              <td><Badge tone={r.status === "PUBLISHED" ? "ok" : "muted"}>{STATUS_LABELS[r.status]}</Badge></td>
              <td>{!r.robotsIndex ? <Badge tone="warn">NOINDEX</Badge> : r.autoNoindex ? <Badge tone="bad">Oto NOINDEX</Badge> : <Badge tone="ok">INDEX</Badge>}</td>
              <td><ScoreBadge score={r.seoScore} /></td>
              <td><ScoreBadge score={r.contentScore} /></td>
              <td className="whitespace-nowrap text-muted">{fmtDate(r.updatedAt)}</td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} total={total} size={SIZE} hrefFor={href} />
      </Card>
    </>
  );
}
