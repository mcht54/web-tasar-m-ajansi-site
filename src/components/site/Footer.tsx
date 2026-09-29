import Link from "next/link";
import type { NavLinks } from "@/lib/seo/graph";
import type { AllSettings } from "@/lib/settings-schema";

const SOCIAL_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", youtube: "YouTube" };

export function Footer({ nav, settings }: { nav: NavLinks; settings: AllSettings }) {
  const b = settings.business;
  const email = b.email || settings.site.email;
  const address = [b.street, b.district, b.city].filter(Boolean).join(", ");
  const social = Object.entries(settings.site.social).filter(([, v]) => /^https?:\/\//.test(v));
  const col = (title: string, links: { path: string; label: string }[]) =>
    links.length > 0 && (
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-snow/40">{title}</p>
        <ul className="space-y-2 text-sm">
          {links.map((l) => (
            <li key={l.path}><Link href={l.path} className="text-snow/70 transition-colors hover:text-snow">{l.label}</Link></li>
          ))}
        </ul>
      </div>
    );
  return (
    <footer className="stage mt-28 overflow-hidden rounded-t-[40px] pb-20 md:pb-0">
      <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 pb-12">
          <p className="max-w-2xl font-display text-[clamp(2.2rem,1.5rem+3vw,4.2rem)] leading-[0.98] tracking-[-0.02em]">
            İyi bir web sitesi <span className="italic text-signal-2">sessizce satış yapar.</span>
          </p>
          <Link href="/teklif-al" className="cta-magnet inline-flex items-center gap-2 rounded-full bg-signal px-7 py-4 font-semibold text-white">
            Projenizi Başlatalım <span aria-hidden className="arrow">→</span>
          </Link>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl">{settings.site.siteName}</p>
          {(b.phone || email || address || settings.site.whatsapp) && (
            <address className="mt-4 space-y-1.5 text-sm not-italic text-snow/70">
              {b.phone && <p><a href={`tel:${b.phone.replace(/\s/g, "")}`} className="hover:text-snow">{b.phone}</a></p>}
              {settings.site.whatsapp && (
                <p><a href={`https://wa.me/${settings.site.whatsapp.replace(/\D/g, "")}`} rel="noopener" className="hover:text-snow">WhatsApp ile yazın</a></p>
              )}
              {email && <p><a href={`mailto:${email}`} className="hover:text-snow">{email}</a></p>}
              {address && <p>{address}</p>}
            </address>
          )}
          {social.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3 text-sm">
              {social.map(([k, v]) => (
                <li key={k}><a href={v} rel="noopener me" className="text-snow/70 underline-offset-4 hover:text-snow hover:underline">{SOCIAL_LABELS[k] ?? k}</a></li>
              ))}
            </ul>
          )}
        </div>
        {col("Hizmetler", nav.footerServices)}
        {col("Sektörler", nav.footerSectors)}
        {col("Kurumsal", nav.footerCompany)}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-snow/40 sm:px-6">© {new Date().getFullYear()} {b.legalName || b.name || settings.site.siteName}</p>
      </div>
    </footer>
  );
}
