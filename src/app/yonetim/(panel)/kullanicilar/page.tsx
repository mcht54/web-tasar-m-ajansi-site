import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { Badge, Card, Notice, PageTitle, Table, fmtDate, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Kullanıcılar" };
const fail = (m: string) => redirect(`/yonetim/kullanicilar?hata=${encodeURIComponent(m)}`);

async function createUser(form: FormData) {
  "use server";
  const me = await requireUser("users");
  const p = z.object({ email: z.email(), name: z.string().trim().min(2).max(80), role: z.enum(["ADMIN", "EDITOR", "SEO"]), password: z.string() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) fail("Geçersiz bilgi: " + p.error.issues[0].message);
  const d = p.data!;
  const problem = passwordProblem(d.password);
  if (problem) fail(problem);
  const email = d.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) fail("Bu e-posta zaten kayıtlı");
  const u = await db.user.create({ data: { email, name: d.name, role: d.role, passwordHash: await hashPassword(d.password) } });
  await audit(me.id, "user.create", "User", u.id, { email, role: d.role });
  redirect("/yonetim/kullanicilar?kaydedildi=1");
}

async function updateUser(form: FormData) {
  "use server";
  const me = await requireUser("users");
  const id = String(form.get("id"));
  const role = z.enum(["ADMIN", "EDITOR", "SEO"]).parse(form.get("role"));
  const active = form.get("active") === "on";
  const password = String(form.get("password") ?? "");
  // Son aktif yöneticiyi kilitlemeyi/indirmeyi engelle
  if ((role !== "ADMIN" || !active) && (await db.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } })) === 0) {
    fail("En az bir aktif yönetici kalmalı");
  }
  if (id === me.id && !active) fail("Kendi hesabınızı pasifleştiremezsiniz");
  const data: { role: Role; active: boolean; passwordHash?: string; failedLogins?: number; lockedUntil?: null } = { role, active };
  if (password) {
    const problem = passwordProblem(password);
    if (problem) fail(problem);
    data.passwordHash = await hashPassword(password);
    data.failedLogins = 0;
    data.lockedUntil = null;
  }
  await db.user.update({ where: { id }, data });
  if (password || !active) await db.session.deleteMany({ where: { userId: id, ...(id === me.id ? { id: { not: me.sessionId } } : {}) } });
  await audit(me.id, "user.update", "User", id, { role, active, passwordChanged: Boolean(password) });
  redirect("/yonetim/kullanicilar?kaydedildi=1");
}

export default async function Users(props: PageProps<"/yonetim/kullanicilar">) {
  const me = await requireUser("users");
  const sp = await props.searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { sessions: true } } } });
  return (
    <>
      <PageTitle title="Kullanıcılar" desc="Yönetici: her şey · Editör: içerik, medya, leadler · SEO Uzmanı: içerik + teknik SEO alanları, anahtar kelimeler, analiz, yönlendirmeler, loglar. Şifreler scrypt ile özetlenir." />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card title="Yeni kullanıcı">
          <form action={createUser} className="space-y-2">
            <input name="name" required placeholder="Ad soyad" className={inputCls} />
            <input name="email" type="email" required placeholder="E-posta" className={inputCls} />
            <select name="role" className={inputCls}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="password" type="password" required placeholder="Şifre (en az 12 karakter, harf + rakam)" autoComplete="new-password" className={inputCls} />
            <button className="rounded-full bg-ink px-4 py-2 text-paper">Oluştur</button>
          </form>
        </Card>
        <Card>
          <Table head={["Kullanıcı", "Rol", "Durum", "Son giriş", "Oturum", "Güncelle"]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td><p className="font-medium">{u.name}{u.id === me.id && " (siz)"}</p><p className="text-xs text-muted">{u.email}</p></td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>{!u.active ? <Badge>Pasif</Badge> : u.lockedUntil && u.lockedUntil > new Date() ? <Badge tone="bad">Kilitli</Badge> : <Badge tone="ok">Aktif</Badge>}</td>
                <td className="whitespace-nowrap">{fmtDate(u.lastLoginAt, true)}</td>
                <td>{u._count.sessions}</td>
                <td>
                  <form action={updateUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} className="rounded border border-line bg-paper px-2 py-1">{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} /> aktif</label>
                    <input name="password" type="password" placeholder="Yeni şifre" autoComplete="new-password" className="w-32 rounded border border-line bg-paper px-2 py-1" />
                    <button className="rounded-full border border-line px-3 py-1 text-xs">Kaydet</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
