import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, Notice, PageTitle, Table, fmtDate, inputCls } from "@/components/admin/ui";
import { ignore404Action, saveRedirectAction, toggleRedirectAction } from "./actions";

export const metadata = { title: "Redirects / 404" };

export default async function Redirects(props: PageProps<"/yonetim/yonlendirmeler">) {
  await requireUser("seo");
  const sp = await props.searchParams;
  const tab = sp.sekme === "404" ? "404" : "redirects";
  const bots = sp.botlar === "1";
  const [redirects, notFound, pages] = await Promise.all([
    db.redirect.findMany({ orderBy: { createdAt: "desc" } }),
    db.notFoundLog.findMany({ where: { resolved: false, ...(bots ? {} : { isBot: false }) }, orderBy: [{ hits: "desc" }, { lastSeenAt: "desc" }], take: 200 }),
    db.page.findMany({ where: { status: "PUBLISHED" }, orderBy: { path: "asc" }, select: { path: true } }),
  ]);
  return (
    <>
      <PageTitle title="Redirects / 404" desc="301 kalıcı, 302 geçici yönlendirme. Zincir ve döngü oluşturan yönlendirmeler otomatik düzeltilir veya engellenir." />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="mb-4 flex gap-2 text-[13px]">
        <Link href="?" className={`rounded-full px-3 py-1.5 ${tab === "redirects" ? "bg-ink text-paper" : "border border-line"}`}>Yönlendirmeler ({redirects.length})</Link>
        <Link href="?sekme=404" className={`rounded-full px-3 py-1.5 ${tab === "404" ? "bg-ink text-paper" : "border border-line"}`}>404 Bulunan URL&apos;ler ({notFound.length})</Link>
      </div>
      <datalist id="pages">{pages.map((p) => <option key={p.path} value={p.path} />)}</datalist>
      {tab === "redirects" ? (
        <>
          <Card title="Yeni yönlendirme">
            <form action={saveRedirectAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_1fr_auto]">
              <input name="fromPath" required placeholder="Eski URL (/eski-sayfa)" className={`${inputCls} mt-0`} />
              <input name="toPath" required list="pages" placeholder="Yeni URL (/yeni-sayfa)" className={`${inputCls} mt-0`} />
              <select name="statusCode" className={`${inputCls} mt-0`}><option value="301">301</option><option value="302">302</option></select>
              <input name="note" placeholder="Not" className={`${inputCls} mt-0`} />
              <button className="rounded-full bg-ink px-4 text-paper">Ekle</button>
            </form>
          </Card>
          <div className="mt-6">
            <Card>
              <Table head={["Eski URL", "Yeni URL", "Kod", "Tıklanma", "Son", "Oluşturan", "Durum", ""]}>
                {redirects.map((r) => (
                  <tr key={r.id}>
                    <td>{r.fromPath}</td><td>{r.toPath}</td><td>{r.statusCode}</td><td>{r.hits}</td><td>{fmtDate(r.lastHitAt)}</td>
                    <td className="text-xs">{r.createdBy ?? "—"}{r.note ? ` · ${r.note}` : ""}</td>
                    <td>{r.active ? <Badge tone="ok">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                    <td className="whitespace-nowrap">
                      <form action={toggleRedirectAction} className="inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="toggle" /><button className="text-xs underline">{r.active ? "Pasifleştir" : "Etkinleştir"}</button></form>{" "}
                      <form action={toggleRedirectAction} className="inline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="delete" /><button className="text-xs text-bad underline">Sil</button></form>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      ) : (
        <Card title="En çok ziyaret edilen 404 sayfaları" actions={<Link href={bots ? "?sekme=404" : "?sekme=404&botlar=1"} className="text-xs underline">{bots ? "Botları gizle" : "Botları da göster"}</Link>}>
          <Table head={["URL", "Ziyaret", "İlk", "Son", "Referans", "Tek tıkla yönlendir", ""]} empty="Kayıtlı 404 yok.">
            {notFound.map((n) => (
              <tr key={n.path}>
                <td className="max-w-xs break-all">{n.path}{n.isBot && <> <Badge>bot</Badge></>}</td>
                <td>{n.hits}</td><td>{fmtDate(n.firstSeenAt)}</td><td>{fmtDate(n.lastSeenAt, true)}</td>
                <td className="max-w-40 truncate text-xs">{n.lastReferrer ?? "—"}</td>
                <td>
                  <form action={saveRedirectAction} className="flex gap-1">
                    <input type="hidden" name="fromPath" value={n.path} /><input type="hidden" name="statusCode" value="301" /><input type="hidden" name="back" value="/yonetim/yonlendirmeler?sekme=404" />
                    <input name="toPath" list="pages" required placeholder="/hedef" className="w-40 rounded border border-line bg-paper px-2 py-1" />
                    <button className="rounded-full bg-ink px-3 text-xs text-paper">301</button>
                  </form>
                </td>
                <td><form action={ignore404Action}><input type="hidden" name="path" value={n.path} /><button className="text-xs underline">Yok say</button></form></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
