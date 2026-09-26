import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, Notice, PageTitle, ScoreBadge, Table, fmtDate, inputCls } from "@/components/admin/ui";
import { createPageAction } from "../sayfalar/actions";

export const metadata = { title: "Blog" };

export default async function BlogAdmin(props: PageProps<"/yonetim/blog">) {
  await requireUser("content");
  const sp = await props.searchParams;
  const posts = await db.page.findMany({ where: { type: "BLOG_POST" }, orderBy: { publishedAt: "desc" } });
  return (
    <>
      <PageTitle title="Blog / Rehber" desc="Her yazı gerçek bir soruya yanıt vermeli. Birbirinin benzeri toplu yazılar üretmeyin — sistem benzer içerikleri kopya olarak işaretler." />
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <Card title="Yeni yazı">
        <form action={createPageAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="kind" value="blog" /><input type="hidden" name="back" value="/yonetim/blog" />
          <input name="title" required placeholder="Başlık (URL bundan üretilir)" className={`${inputCls} mt-0 min-w-72 flex-1`} />
          <input name="category" placeholder="Kategori" className={`${inputCls} mt-0 max-w-48`} />
          <button className="rounded-full bg-ink px-4 text-paper">Taslak oluştur</button>
        </form>
      </Card>
      <div className="mt-6">
        <Card>
          <Table head={["Yazı", "Kategori", "Durum", "SEO", "İçerik", "Yayın"]}>
            {posts.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/yonetim/sayfalar/${p.id}`} className="font-medium hover:underline">{p.h1 || p.name}</Link><div className="text-xs text-muted">{p.path}</div></td>
                <td>{p.category ?? "—"}</td>
                <td><Badge tone={p.status === "PUBLISHED" ? "ok" : "muted"}>{p.status === "PUBLISHED" ? "Yayında" : "Taslak"}</Badge></td>
                <td><ScoreBadge score={p.seoScore} /></td>
                <td><ScoreBadge score={p.contentScore} /></td>
                <td>{fmtDate(p.publishedAt)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
