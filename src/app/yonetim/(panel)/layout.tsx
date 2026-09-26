import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { MENU } from "@/components/admin/menu";
import { SidebarNav } from "@/components/admin/Sidebar";
import { db } from "@/lib/db";
import { getSettingsFresh } from "@/lib/settings";
import { logout } from "../(auth)/giris/actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections = MENU.map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || can(user.role, i.perm)) })).filter((s) => s.items.length);
  const [newLeads, openCritical, settings] = await Promise.all([
    can(user.role, "leads") ? db.lead.count({ where: { status: "NEW" } }) : 0,
    can(user.role, "seo") ? db.seoTask.count({ where: { status: "OPEN", severity: { in: ["CRITICAL", "HIGH"] } } }) : 0,
    getSettingsFresh(),
  ]);
  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-card lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/yonetim" className="font-display text-xl">Yönetim</Link>
          <Link href="/" target="_blank" className="text-xs text-muted underline">Siteyi aç ↗</Link>
        </div>
        <details className="px-2 pb-4 lg:hidden">
          <summary className="mx-3 rounded-lg border border-line px-3 py-2 text-sm">Menü</summary>
          <div className="mt-3"><SidebarNav sections={sections} badges={{ "/yonetim/leadler": newLeads, "/yonetim/firsatlar": openCritical }} /></div>
        </details>
        <div className="hidden px-2 pb-6 lg:block">
          <SidebarNav sections={sections} badges={{ "/yonetim/leadler": newLeads, "/yonetim/firsatlar": openCritical }} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-end gap-3 border-b border-line px-6 py-3 text-[13px]">
          <span className="text-muted">{user.name} · {ROLE_LABELS[user.role]}</span>
          <form action={logout}><button className="rounded-full border border-line px-3 py-1 hover:border-ink">Çıkış</button></form>
        </header>
        {!settings.seo.allowIndexing && (
          <div className="border-b border-bad/40 bg-bad/10 px-6 py-2 text-[13px] font-semibold text-bad">
            Site genelinde indeksleme KAPALI — tüm sayfalar NOINDEX ve sitemap boş. Ayarlar &gt; SEO&apos;dan açabilirsiniz.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
