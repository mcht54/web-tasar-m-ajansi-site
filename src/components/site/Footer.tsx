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
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</p>
        <ul className="space-y-2 text-sm">
          {links.map((l) => (
            <li key={l.path}><Link href={l.path} className="text-ink-soft hover:text-ink">{l.label}</Link></li>
          ))}
        </ul>
      </div>
    );
  return (
    <footer className="mt-24 border-t border-line bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <p className="font-display text-2xl">{settings.site.siteName}</p>
          {(b.phone || email || address || settings.site.whatsapp) && (
            <address className="mt-4 space-y-1 text-sm not-italic text-ink-soft">
              {b.phone && <p><a href={`tel:${b.phone.replace(/\s/g, "")}`} className="hover:text-ink">{b.phone}</a></p>}
              {settings.site.whatsapp && (
                <p><a href={`https://wa.me/${settings.site.whatsapp.replace(/\D/g, "")}`} rel="noopener" className="hover:text-ink">WhatsApp ile yazın</a></p>
              )}
              {email && <p><a href={`mailto:${email}`} className="hover:text-ink">{email}</a></p>}
              {address && <p>{address}</p>}
            </address>
          )}
          {social.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3 text-sm">
              {social.map(([k, v]) => (
                <li key={k}><a href={v} rel="noopener me" className="text-ink-soft underline-offset-4 hover:underline">{SOCIAL_LABELS[k] ?? k}</a></li>
              ))}
            </ul>
          )}
        </div>
        {col("Hizmetler", nav.footerServices)}
        {col("Sektörler", nav.footerSectors)}
        {col("Kurumsal", nav.footerCompany)}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">© {new Date().getFullYear()} {b.legalName || b.name || settings.site.siteName}</p>
      </div>
    </footer>
  );
}
