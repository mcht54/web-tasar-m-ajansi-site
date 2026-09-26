import type { Metadata } from "next";
import { getLogo, getSiteChrome } from "@/lib/site/public";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MobileActionBar } from "@/components/site/Blocks";
import { Analytics } from "@/components/site/Analytics";

/** Ayarlardan favicon seçildiyse onu kullan; yoksa varsayılan /icon.svg. */
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteChrome();
  const fav = settings.site.faviconId ? await getLogo(settings.site.faviconId) : null;
  return fav ? { icons: { icon: fav.url } } : {};
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { settings, nav, logo } = await getSiteChrome();
  return (
    <>
      <Header nav={nav} siteName={settings.site.siteName} logo={logo} phone={settings.business.phone} />
      <main id="icerik" className="pb-24 md:pb-0">{children}</main>
      <Footer nav={nav} settings={settings} />
      <MobileActionBar phone={settings.business.phone} whatsapp={settings.site.whatsapp} />
      <Analytics gaId={settings.integrations.gaId} gtmId={settings.integrations.gtmId} />
    </>
  );
}
