import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Card, PageTitle, Pagination, Table, fmtDate } from "@/components/admin/ui";

export const metadata = { title: "Loglar" };
const SIZE = 100;

export default async function Logs(props: PageProps<"/yonetim/loglar">) {
  await requireUser("logs");
  const sp = await props.searchParams;
  const tab = sp.sekme === "denetim" ? "denetim" : sp.sekme === "isler" ? "isler" : "seo";
  const page = Math.max(1, Number(sp.s) || 1);
  const q = typeof sp.q === "string" ? sp.q : "";
  if (tab === "isler") {
    const jobs = await db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 });
    return (
      <>
        <PageTitle title="Loglar" desc="Zamanlanmış ve elle çalıştırılan işlerin gerçek sonuçları. Başarısız adımı olan iş “hata” olarak kaydedilir." />
        <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
          <Link href="?sekme=seo" className="rounded-full border border-line px-3 py-1.5">SEO değişiklikleri</Link>
          <Link href="?sekme=denetim" className="rounded-full border border-line px-3 py-1.5">Denetim (audit)</Link>
          <Link href="?sekme=isler" className="rounded-full bg-ink px-3 py-1.5 text-paper">İş geçmişi</Link>
        </div>
        <Card>
          <Table head={["Başlangıç", "İş", "Durum", "Süre", "Tetikleyen", "Mesaj"]}>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="whitespace-nowrap">{fmtDate(j.startedAt, true)}</td>
                <td className="font-mono text-xs">{j.kind}</td>
                <td><span className={j.status === "error" ? "font-semibold text-bad" : j.status === "ok" ? "text-ok" : "text-muted"}>{{ ok: "başarılı", error: "HATA", skipped: "atlandı", running: "çalışıyor" }[j.status] ?? j.status}</span></td>
                <td className="text-xs">{j.finishedAt ? `${Math.round((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000)} sn` : "—"}</td>
                <td className="text-xs">{j.triggeredBy ?? "—"}</td>
                <td className="max-w-xl whitespace-pre-line break-words text-xs">{j.message ?? ""}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }
  const [rows, total] = tab === "seo"
    ? await Promise.all([
        db.seoChangeLog.findMany({ where: q ? { path: { contains: q } } : {}, orderBy: { createdAt: "desc" }, skip: (page - 1) * SIZE, take: SIZE, include: { page: { select: { id: true } } } }),
        db.seoChangeLog.count({ where: q ? { path: { contains: q } } : {} }),
      ])
    : await Promise.all([
        db.auditLog.findMany({ where: q ? { action: { contains: q } } : {}, orderBy: { createdAt: "desc" }, skip: (page - 1) * SIZE, take: SIZE, include: { user: { select: { name: true } } } }),
        db.auditLog.count({ where: q ? { action: { contains: q } } : {} }),
      ]);
  const short = (s: string | null) => (!s ? "—" : s.length > 160 ? `${s.slice(0, 160)}…` : s);
  return (
    <>
      <PageTitle title="Loglar" desc="SEO değişiklik logu her alan değişikliğini önce/sonra ve kim bilgisiyle tutar. Denetim logu giriş, ayar, kullanıcı ve silme işlemlerini kaydeder." />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
        <Link href="?sekme=seo" className={`rounded-full px-3 py-1.5 ${tab === "seo" ? "bg-ink text-paper" : "border border-line"}`}>SEO değişiklikleri</Link>
        <Link href="?sekme=denetim" className={`rounded-full px-3 py-1.5 ${tab === "denetim" ? "bg-ink text-paper" : "border border-line"}`}>Denetim (audit)</Link>
        <Link href="?sekme=isler" className="rounded-full border border-line px-3 py-1.5">İş geçmişi</Link>
        <form className="ml-auto"><input type="hidden" name="sekme" value={tab} /><input name="q" defaultValue={q} placeholder={tab === "seo" ? "URL ile ara" : "İşlem ile ara (ör. login)"} className="rounded-full border border-line bg-card px-3 py-1.5" /></form>
      </div>
      <Card>
        {tab === "seo" ? (
          <Table head={["Tarih", "URL", "Alan", "Önce", "Sonra", "Kim"]}>
            {(rows as Awaited<ReturnType<typeof db.seoChangeLog.findMany<{ include: { page: { select: { id: true } } } }>>>).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDate(r.createdAt, true)}</td>
                <td>{r.page ? <Link href={`/yonetim/sayfalar/${r.page.id}`} className="hover:underline">{r.path}</Link> : r.path}</td>
                <td className="font-medium">{r.field}</td>
                <td className="max-w-xs break-words text-muted">{short(r.before)}</td>
                <td className="max-w-xs break-words">{short(r.after)}</td>
                <td>{r.userName ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table head={["Tarih", "Kullanıcı", "İşlem", "Kayıt", "Ayrıntı", "IP"]}>
            {(rows as Awaited<ReturnType<typeof db.auditLog.findMany<{ include: { user: { select: { name: true } } } }>>>).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDate(r.createdAt, true)}</td>
                <td>{r.user?.name ?? "—"}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs">{[r.entity, r.entityId].filter(Boolean).join(" · ")}</td>
                <td className="max-w-sm break-words text-xs text-muted">{r.detail ? short(JSON.stringify(r.detail)) : ""}</td>
                <td className="text-xs">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination page={page} total={total} size={SIZE} hrefFor={(p) => `?sekme=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}&s=${p}`} />
      </Card>
    </>
  );
}
