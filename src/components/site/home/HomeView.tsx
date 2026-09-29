import Link from "next/link";
import type { SiteGraph } from "@/lib/seo/graph";
import type { AllSettings } from "@/lib/settings-schema";
import { autoSchemaTypes } from "@/lib/seo/schema";
import { getBlogList, getHomeStats, getPublishedReferences, getServiceCards, getShowcasePages, type PublicPage } from "@/lib/site/public";
import { mediaSources, mediaUrl, type MediaVariant } from "@/lib/media/urls";
import { Faq, LinkGroups, Prose } from "../Blocks";
import { BrowserFrame, Laptop, MiniSite, Orb, Phone, PhoneScreens, Ring, SectorScreen } from "./Mockups";
import { Motion } from "./Motion";

// Ana sayfa deneyimi. İlke: yalnızca gerçek veri. Müşteri referansı yoksa vitrin bu sitenin kendi
// sayfalarını gösterir (öyle etiketlenir); sayılar veritabanından gelir; SERP/panel görselleri
// "temsili" diye işaretlenir ve sıralama/sonuç iddiası taşımaz.

type Props = {
  page: PublicPage & { faqItems: { q: string; a: string }[] };
  html: string;
  graph: SiteGraph;
  settings: AllSettings;
  related: { path: string; label: string }[];
};

const SHOWCASE = ["/kurumsal-web-tasarim", "/e-ticaret-web-tasarim", "/seo-hizmeti", "/restoran-web-tasarimi"];
const TYPE_LABEL: Record<string, string> = { SERVICE: "Hizmet sayfası", SECTOR: "Sektör sayfası", BLOG_POST: "Rehber yazısı" };
const H2 = "font-display text-[clamp(2.3rem,1.4rem+3.4vw,4.6rem)] leading-[0.98] tracking-[-0.025em]";
const EYEBROW = "text-xs font-semibold uppercase tracking-[0.2em]";

export async function HomeView({ page, html, graph, settings, related }: Props) {
  const [services, posts, refs, stats, showcase] = await Promise.all([
    getServiceCards(), getBlogList(), getPublishedReferences(), getHomeStats(), getShowcasePages(SHOWCASE),
  ]);
  const cities = graph.nodes.filter((n) => n.published && n.type === "CITY").sort((a, b) => a.crumb.localeCompare(b.crumb, "tr"));
  const sectors = graph.nodes.filter((n) => n.published && n.type === "SECTOR").sort((a, b) => a.sortOrder - b.sortOrder);
  const serviceNames = services.map((s) => s.name);
  const whatsapp = settings.site.whatsapp;

  return (
    <>
      <Motion />
      <Hero page={page} serviceNames={serviceNames} avgSeo={stats.avgSeo} scored={stats.scored} />
      <Flow />
      <Devices serviceNames={serviceNames} sectorNames={sectors.map((x) => x.crumb)} />
      <Work refs={refs} showcase={showcase} settings={settings} />
      <Services services={services} />
      <Process />
      <Seo />
      <Proof stats={stats} html={html} />

      {sectors.length > 0 && (
        <section aria-labelledby="sektorler" className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:items-end">
            <div data-reveal>
              <p className={`${EYEBROW} text-accent`}>Sektörler</p>
              <h2 id="sektorler" className={`mt-4 ${H2}`}>Sektörünüzün diliyle.</h2>
            </div>
            <p data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="max-w-xl text-lg text-ink-soft">
              Her sektörde ziyaretçinin aradığı bilgi farklıdır. Sayfa yapısını, içerik sırasını ve iletişim adımını buna göre kuruyoruz.
            </p>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {sectors.map((s, i) => (
              <li key={s.path} data-reveal style={{ "--d": `${(i % 5) * 60}ms` } as React.CSSProperties}>
                <Link href={s.path} className="group flex h-full items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-4 font-semibold transition-colors hover:border-ink hover:bg-ink hover:text-paper">
                  {s.crumb}
                  <span aria-hidden className="text-accent transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cities.length > 0 && (
        <section aria-labelledby="lokasyonlar" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
          <h2 id="lokasyonlar" className="font-display text-[clamp(2rem,1.5rem+2vw,3rem)]">Lokasyonlar</h2>
          <ul className="mt-8 flex flex-wrap gap-2">
            {cities.map((c) => (
              <li key={c.path}><Link href={c.path} className="inline-block rounded-full border border-line bg-card px-4 py-2 text-sm hover:border-ink">{c.anchor}</Link></li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section aria-labelledby="rehber" className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4" data-reveal>
            <div>
              <p className={`${EYEBROW} text-accent`}>Rehber</p>
              <h2 id="rehber" className={`mt-4 ${H2}`}>Karar vermeden önce okuyun.</h2>
            </div>
            <Link href="/blog" className="group inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink">
              Tüm yazılar <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {posts.slice(0, 3).map((p, i) => (
              <Link key={p.path} href={p.path} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties}
                className="group flex flex-col rounded-[28px] border border-line bg-card p-7 transition-[border-color,transform] duration-500 hover:-translate-y-1 hover:border-ink">
                {p.category && <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{p.category}</span>}
                <h3 className="mt-4 font-display text-[1.7rem] leading-[1.05]">{p.h1 || p.name}</h3>
                {p.excerpt && <p className="mt-3 line-clamp-3 text-ink-soft">{p.excerpt}</p>}
                <span className="mt-auto pt-6 text-sm font-semibold">Yazıyı oku <span aria-hidden className="inline-block text-accent transition-transform group-hover:translate-x-1">→</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && <div className="mx-auto mt-16 max-w-7xl px-4 sm:px-6"><LinkGroups groups={[{ key: "related", title: "İlgili sayfalar", links: related }]} /></div>}
      <div className="mt-28"><Faq items={page.faqItems} /></div>
      <FinalCta whatsapp={whatsapp} />
    </>
  );
}

/* ─── 1. Hero ─────────────────────────────────────────────────────────────── */
function Hero({ page, serviceNames, avgSeo, scored }: { page: Props["page"]; serviceNames: string[]; avgSeo: number | null; scored: number }) {
  return (
    <section data-parallax data-live className="stage relative -mt-[76px] overflow-hidden pb-20 pt-[132px] sm:pb-28 sm:pt-[156px]">
      <div aria-hidden className="stage-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="glow-signal plx pointer-events-none absolute -right-40 top-10 h-[620px] w-[620px] rounded-full" style={{ "--depth": -24 } as React.CSSProperties} />
      <div aria-hidden className="glow-ultra plx pointer-events-none absolute -left-52 bottom-0 h-[520px] w-[520px] rounded-full" style={{ "--depth": 18 } as React.CSSProperties} />

      <div className="relative mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
        <div>
          <p className="rise chip border border-white/12 bg-white/5 text-snow/80">
            <span className="blink h-1.5 w-1.5 rounded-full bg-signal" /> Web tasarım · SEO · Dönüşüm
          </p>
          <h1 className="rise mt-7 font-display text-[clamp(2.9rem,1.5rem+5.6vw,6.4rem)] leading-[0.94] tracking-[-0.03em]" style={{ "--d": "90ms" } as React.CSSProperties}>
            {page.h1}
          </h1>
          <p className="rise mt-7 font-display text-[clamp(1.4rem,1.1rem+1vw,2rem)] italic leading-tight" style={{ "--d": "180ms" } as React.CSSProperties}>
            <span className="text-gradient">Güzel görünmesi yetmez — iş getirmeli.</span>
          </p>
          {page.intro && (
            <p className="rise mt-5 max-w-xl text-lg leading-relaxed text-snow/70" style={{ "--d": "260ms" } as React.CSSProperties}>{page.intro}</p>
          )}
          <div className="rise mt-10 flex flex-wrap items-center gap-3" style={{ "--d": "340ms" } as React.CSSProperties}>
            <Link href="/teklif-al" className="cta-magnet inline-flex items-center gap-2 rounded-full bg-signal px-7 py-4 font-semibold text-white">
              Projenizi Başlatalım <span aria-hidden className="arrow">→</span>
            </Link>
            <Link href="#calismalar" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-4 font-semibold text-snow transition-colors hover:border-white hover:bg-white/5">
              Çalışmalarımızı Gör
            </Link>
            <Link href="/teklif-al#on-analiz" className="px-2 py-4 text-sm font-semibold text-snow/70 underline decoration-signal underline-offset-[6px] hover:text-snow">
              Ücretsiz Ön Analiz
            </Link>
          </div>
        </div>

        {/* Cihaz kompozisyonu: dizüstü + telefon + iki cam kart; her katman farklı paralaks derinliği */}
        <div aria-hidden className="fade-in relative mx-auto aspect-[16/12] w-full max-w-[640px]" style={{ "--d": "200ms" } as React.CSSProperties}>
          <div className="plx absolute left-0 top-[4%] w-[86%]" style={{ "--depth": 8 } as React.CSSProperties}>
            <div className="float-slow">
              <Laptop url="webtasarimajansi.net">
                <MiniSite title="İş getiren web siteleri." items={serviceNames} />
              </Laptop>
            </div>
          </div>
          <div className="plx absolute bottom-0 right-0 w-[29%]" style={{ "--depth": 22 } as React.CSSProperties}>
            <div className="float" style={{ "--d": "-2s" } as React.CSSProperties}>
              <Phone><PhoneScreens title="Mobilde de kusursuz." items={serviceNames} /></Phone>
            </div>
          </div>
          {/* SEO kartı — mobil: dizüstünün altına (ekran düğmelerinin üstüne binmesin), daha küçük; sm ve üstü: önceki konum/ölçek */}
          {avgSeo != null && (
            <div className="plx absolute -bottom-[16%] left-0 sm:-left-6 sm:bottom-[10%]" style={{ "--depth": 30 } as React.CSSProperties}>
              <div className="float glass rounded-xl px-3 py-2 text-snow sm:rounded-2xl sm:px-4 sm:py-3" style={{ "--d": "-4s" } as React.CSSProperties}>
                <p className="text-[10px] text-snow/60 sm:text-[11px]">Ortalama SEO skoru · {scored} sayfa</p>
                <p className="mt-0.5 flex items-baseline gap-2 font-display text-2xl sm:text-3xl">{avgSeo}<span className="text-xs text-snow/50 sm:text-sm">/100</span></p>
                <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-white/10 sm:mt-2 sm:h-1.5 sm:w-36"><div className="h-full rounded-full bg-gradient-to-r from-signal to-volt" style={{ width: `${avgSeo}%` }} /></div>
              </div>
            </div>
          )}
          <div className="plx absolute right-[18%] top-0 hidden sm:block" style={{ "--depth": -16 } as React.CSSProperties}>
            <div className="float glass rounded-2xl px-4 py-3 text-snow" style={{ "--d": "-1s" } as React.CSSProperties}>
              <p className="flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-volt" /> Mobil öncelikli · Hızlı · Erişilebilir</p>
            </div>
          </div>
        </div>
      </div>

      {serviceNames.length > 0 && (
        <div aria-hidden className="relative mt-20 overflow-hidden border-y border-white/10 py-5 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <div className="marquee-track flex w-max gap-12 whitespace-nowrap font-display text-2xl text-snow/50">
            {[...serviceNames, ...serviceNames].map((n, i) => (
              <span key={i} className="flex items-center gap-12">{n}<span className="text-signal">✦</span></span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── 2. Etki akışı ───────────────────────────────────────────────────────── */
const FLOW = [
  ["Ziyaretçi", "Google'da sizi arayan kişi"],
  ["Web sitesi", "Hızlı açılan, net bir ilk ekran"],
  ["Güven", "Açık bilgi, gerçek içerik"],
  ["İletişim", "Tek dokunuşla arama, WhatsApp, form"],
  ["Teklif", "İhtiyacı anlatan talep"],
  ["Müşteri", "İşinize dönüşen ziyaret"],
];

function Flow() {
  return (
    <section aria-labelledby="etki" className="relative mx-auto max-w-7xl px-4 pt-28 sm:px-6 sm:pt-36">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <h2 id="etki" data-reveal className={H2}>
          Sadece web sitesi <span className="italic text-accent">yapmıyoruz.</span>
        </h2>
        <p data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="max-w-lg text-lg leading-relaxed text-ink-soft">
          Bir web sitesinin görevi ziyaretçiyi müşteriye götüren yolu kısaltmaktır. Tasarladığımız her ekran bu yolun bir adımına hizmet eder.
        </p>
      </div>

      <div data-reveal className="relative mt-16">
        <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-[34px] hidden h-[60px] w-full lg:block">
          <path className="flow-line" d="M20 60 C 200 0, 300 120, 420 60 S 640 0, 800 60 S 1020 120, 1180 60" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <ol className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FLOW.map(([t, d], i) => (
            <li key={t} className="flow-node relative rounded-3xl border border-line bg-card p-4 sm:p-5 lg:text-center" style={{ "--d": `${300 + i * 220}ms` } as React.CSSProperties}>
              <span className={`mx-0 grid h-10 w-10 place-items-center rounded-2xl font-display text-xl sm:h-12 sm:w-12 lg:mx-auto ${i === FLOW.length - 1 ? "bg-accent text-accent-ink" : "bg-ink text-paper"}`}>{i + 1}</span>
              <p className="mt-4 text-lg font-semibold">{t}</p>
              <p className="mt-1 text-sm text-ink-soft">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── 3. Cihazlar ─────────────────────────────────────────────────────────── */
function Devices({ serviceNames, sectorNames }: { serviceNames: string[]; sectorNames: string[] }) {
  const points = [
    ["Önce telefon", "Tasarım küçük ekrandan başlar; masaüstü sonra genişler."],
    ["Başparmak mesafesi", "Arama, WhatsApp ve teklif düğmeleri her sayfada ekranın altında."],
    ["Hafif sayfalar", "Gereksiz betik ve ağır video yok; içerik ilk anda okunur."],
    ["Kısa formlar", "Yalnızca gerekli alanlar; telefonda klavye doğru açılır."],
  ];
  return (
    <section aria-labelledby="mobil" className="relative mt-28 overflow-hidden sm:mt-36">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <p data-reveal className={`${EYEBROW} text-accent`}>Mobil deneyim</p>
          <h2 id="mobil" data-reveal className={`mt-4 ${H2}`}>Mobilde de kusursuz.</h2>
          <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {points.map(([t, d], i) => (
              <li key={t} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="border-t border-line pt-4">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-ink-soft">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <div data-live aria-hidden className="relative order-1 mx-auto flex w-full max-w-[520px] justify-center py-6 lg:order-2">
          <div className="absolute inset-[8%] rounded-full bg-accent/15 blur-3xl" />
          <div className="relative flex items-end gap-5 sm:gap-8">
            <div className="sd-drift w-[140px] opacity-90 sm:w-[170px]">
              <Phone><SectorScreen items={sectorNames.length ? sectorNames : serviceNames} /></Phone>
            </div>
            <div className="sd-phone w-[190px] sm:w-[230px]">
              <Phone><PhoneScreens title="Sizi arayan müşteriye ulaşın." items={serviceNames} /></Phone>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 4. Çalışmalar ───────────────────────────────────────────────────────── */
type Ref = Awaited<ReturnType<typeof getPublishedReferences>>[number];
type Show = Awaited<ReturnType<typeof getShowcasePages>>[number];

function Work({ refs, showcase, settings }: { refs: Ref[]; showcase: Show[]; settings: AllSettings }) {
  if (!refs.length && !showcase.length) return null;
  return (
    <section aria-labelledby="calismalar" className="stage relative mt-28 scroll-mt-24 overflow-hidden py-24 sm:mt-36 sm:py-32">
      <div aria-hidden className="glow-signal pointer-events-none absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full opacity-60" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p data-reveal className={`${EYEBROW} text-signal`}>Çalışmalar</p>
            <h2 id="calismalar" data-reveal className={`mt-4 ${H2}`}>İşimizin en iyi örneği, <span className="italic text-signal-2">şu an içinde gezindiğiniz site.</span></h2>
          </div>
          <p data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="max-w-lg text-lg text-snow/65">
            {refs.length
              ? "Yayındaki müşteri projelerimiz ve bu sitenin kendi sayfaları; hepsi aynı standartla tasarlandı."
              : "Müşteri referanslarımız izinleriyle yayına alındıkça burada yer alacak. Aşağıdaki sayfalar bu sitenin kendisidir; değerler sitenin kendi analiz motorundan canlı gelir."}
          </p>
        </div>

        {refs.length > 0 && (
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {refs.map((r, i) => (
              <figure key={r.id} data-reveal style={{ "--d": `${(i % 2) * 100}ms` } as React.CSSProperties} className="show-card overflow-hidden rounded-[28px] border border-white/10 bg-night-2">
                {r.image && (
                  <div className="overflow-hidden">
                    <picture className="show-media block">
                      {mediaSources(r.image.variants as MediaVariant[]).map((s) => <source key={s.type} type={s.type} srcSet={s.srcset} sizes="(min-width:768px) 600px, 100vw" />)}
                      { }
                      <img src={mediaUrl(r.image.filename)} alt={r.image.alt ?? r.name} width={r.image.width} height={r.image.height} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover" />
                    </picture>
                  </div>
                )}
                <figcaption className="p-6">
                  <p className="show-title font-display text-2xl">{r.url ? <a href={r.url} rel="noopener" className="hover:text-signal-2">{r.name}</a> : r.name}</p>
                  {r.description && <p className="mt-2 text-snow/65">{r.description}</p>}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="mt-16 space-y-8 sm:mt-20 lg:space-y-10">
          {showcase.map((s, i) => {
            const schema = autoSchemaTypes(s.type, s.path, s.faqCount, settings.business).filter((t) => !s.schemaDisabled.includes(t));
            const flip = i % 2 === 1;
            return (
              <Link key={s.path} href={s.path} data-reveal
                className="show-card group grid items-center gap-8 rounded-[32px] border border-white/10 bg-night-2/80 p-5 transition-colors hover:border-white/25 sm:p-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12 lg:p-10">
                <div className={`relative overflow-hidden rounded-2xl ${flip ? "lg:order-2" : ""}`}>
                  <div className="show-media"><div className="sd-tilt">
                    <BrowserFrame url={`webtasarimajansi.net${s.path}`}>
                      <ShowcaseScreen s={s} index={i} />
                    </BrowserFrame>
                  </div></div>
                  <span className="show-cta absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-signal px-5 py-3 text-sm font-semibold text-white shadow-lg">
                    Sayfayı İncele <span aria-hidden>→</span>
                  </span>
                </div>
                <div className={flip ? "lg:order-1" : ""}>
                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-snow/50">
                    <span className="text-signal-2">0{i + 1}</span> · {TYPE_LABEL[s.type] ?? "Sayfa"}
                  </p>
                  <h3 className="show-title mt-4 font-display text-[clamp(1.9rem,1.4rem+1.6vw,3rem)] leading-[1]">{s.h1 || s.name}</h3>
                  {s.intro && <p className="mt-4 line-clamp-3 text-snow/65">{s.intro}</p>}
                  <dl className="mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
                    {s.seoScore != null && <div><dt className="text-xs text-snow/50">SEO skoru</dt><dd className="mt-1 font-display text-3xl">{s.seoScore}</dd></div>}
                    <div><dt className="text-xs text-snow/50">Kelime</dt><dd className="mt-1 font-display text-3xl">{s.words}</dd></div>
                    <div><dt className="text-xs text-snow/50">SSS</dt><dd className="mt-1 font-display text-3xl">{s.faqCount}</dd></div>
                  </dl>
                  <ul className="mt-5 flex flex-wrap gap-2" aria-label="Yapılandırılmış veri">
                    {schema.map((t) => <li key={t} className="rounded-full border border-white/12 px-3 py-1 text-xs text-snow/70">{t}</li>)}
                    {s.primaryKeyword && <li className="rounded-full bg-white/8 px-3 py-1 text-xs text-snow/70">“{s.primaryKeyword}”</li>}
                  </ul>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Vitrindeki tarayıcının içi: sayfanın gerçek başlığıyla çizilmiş sade bir ekran görüntüsü. */
function ShowcaseScreen({ s, index }: { s: Show; index: number }) {
  const tone = ["bg-[#f7f5f0]", "bg-[#eef0ff]", "bg-[#fff1ea]", "bg-[#f1f5e8]"][index % 4];
  const art = ([
    { bg: "linear-gradient(150deg,#1a0d08,#3a1407)", hue: "signal", accent: "ultra" },
    { bg: "linear-gradient(150deg,#0c0e2a,#1d2170)", hue: "ultra", accent: "volt" },
    { bg: "linear-gradient(150deg,#2a0716,#5a0f30)", hue: "rose", accent: "signal" },
    { bg: "linear-gradient(150deg,#0f1a05,#2c4a0a)", hue: "volt", accent: "rose" },
  ] as const)[index % 4];
  return (
    <div aria-hidden className={`flex aspect-[16/10] flex-col ${tone} px-[5cqw] pb-[4cqw] pt-[3.4cqw] text-[#14161a] [container-type:inline-size]`}>
      <div className="flex items-center justify-between text-[2cqw] text-[#6b7080]">
        <span className="flex items-center gap-[1cqw] font-bold text-[#14161a]"><span className="inline-block h-[2.6cqw] w-[2.6cqw] rounded-[.7cqw] bg-[#14161a]" />MCHT</span>
        <span className="flex gap-[2.4cqw]"><span>Hizmetler</span><span>Süreç</span><span className="rounded-full bg-[#ff4d1f] px-[1.6cqw] text-white">Teklif</span></span>
      </div>
      <div className="mt-[4cqw] grid flex-1 grid-cols-[1.5fr_1fr] gap-[4cqw]">
        <div className="flex flex-col">
          <p className="text-[1.9cqw] text-[#6b7080]">Ana sayfa › {s.name}</p>
          <p className="mt-[1.6cqw] font-display text-[6.6cqw] leading-[.98]">{s.h1 || s.name}</p>
          <div className="mt-[2.6cqw] space-y-[1.3cqw]">
            {[94, 88, 70].map((w, i) => <div key={i} className="h-[1.3cqw] skel" style={{ width: `${w}%` }} />)}
          </div>
          <div className="mt-[3cqw] flex flex-wrap gap-[1.2cqw]">
            {["Mobil öncelikli", "Hızlı açılış", "SSS + Schema"].map((t) => (
              <span key={t} className="flex items-center gap-[.8cqw] rounded-full border border-[#14161a]/10 bg-white px-[1.8cqw] py-[.8cqw] text-[1.7cqw] font-medium shadow-sm"><span className="h-[1.2cqw] w-[1.2cqw] rounded-full bg-[#ff4d1f]" />{t}</span>
            ))}
          </div>
          <div className="mt-auto flex gap-[1.4cqw]">
            <span className="rounded-full bg-[#14161a] px-[2.6cqw] py-[1.2cqw] text-[1.9cqw] font-semibold text-white">Teklif Al</span>
            <span className="rounded-full border border-[#14161a]/20 px-[2.6cqw] py-[1.2cqw] text-[1.9cqw] font-semibold">Ön Analiz</span>
          </div>
        </div>
        <div className="flex flex-col gap-[2cqw]">
          <div className="relative flex-1 overflow-hidden rounded-[2.4cqw]" style={{ background: art.bg }}>
            <Ring className="absolute left-[8%] top-[4%] w-[84%]" />
            <Orb hue={art.hue} className="absolute left-[22%] top-[16%] w-[56%] text-[1.2cqw]" />
            <Orb hue={art.accent} className="absolute bottom-[10%] right-[8%] w-[18%] text-[.6cqw]" />
          </div>
          <div className="rounded-[2.4cqw] bg-white p-[2cqw] shadow-sm">
            <p className="text-[1.8cqw] font-semibold">Sık sorulan sorular</p>
            {Array.from({ length: Math.min(3, Math.max(1, s.faqCount)) }).map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-[#eee] py-[1cqw] last:border-0">
                <div className="h-[1cqw] w-[70%] skel" /><span className="text-[1.8cqw] text-[#ff4d1f]">+</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 5. Hizmetler (bento) ────────────────────────────────────────────────── */
type ServiceCard = Awaited<ReturnType<typeof getServiceCards>>[number];

function Services({ services }: { services: ServiceCard[] }) {
  return (
    <section aria-labelledby="hizmetler" className="mx-auto mt-28 max-w-7xl scroll-mt-24 px-4 sm:mt-36 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p data-reveal className={`${EYEBROW} text-accent`}>Hizmetler</p>
          <h2 id="hizmetler" data-reveal className={`mt-4 ${H2}`}>Tek ekip, <span className="italic">uçtan uca.</span></h2>
        </div>
        <p data-reveal style={{ "--d": "120ms" } as React.CSSProperties} className="max-w-lg text-lg text-ink-soft">
          Strateji, tasarım, yazılım ve arama görünürlüğü aynı masada planlanır. Kartların üzerine gelin; her hizmetin neyi çözdüğünü görün.
        </p>
      </div>
      <div className="mt-12 grid auto-rows-[minmax(240px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-4">
        {services.map((s, i) => {
          const path = s.pages[0]?.path ?? "/";
          const big = i === 0 || i === 3;
          const last = i === services.length - 1;
          // Izgarada boş hücre kalmasın: son kart kalan sütunları doldurur
          const lgRem = (services.length + 2) % 4;
          const fill = last ? `${services.length % 2 ? "md:col-span-2" : ""} ${lgRem === 3 ? "lg:col-span-2" : lgRem === 2 ? "lg:col-span-3" : lgRem === 1 ? "lg:col-span-4" : ""}` : "";
          return (
            <Link key={s.name} href={path} data-reveal style={{ "--d": `${(i % 4) * 70}ms` } as React.CSSProperties}
              className={`bento-card group relative flex flex-col overflow-hidden rounded-[28px] border p-6 ${big ? "lg:col-span-2" : ""} ${fill} ${i === 0 ? "border-transparent bg-ink text-paper" : "border-line bg-card hover:border-ink"}`}>
              <div className="flex items-start justify-between gap-4">
                <h3 className={`font-display leading-[1.02] ${big ? "text-[2rem]" : "text-[1.55rem]"}`}>{s.name}</h3>
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform group-hover:-rotate-45 ${i === 0 ? "bg-accent text-accent-ink" : "bg-ink text-paper"}`}>→</span>
              </div>
              <div className="relative mt-5 flex-1">
                <div aria-hidden className="bento-a absolute inset-0"><ServiceUi slug={path.slice(1)} dark={i === 0} /></div>
                <p className={`bento-b absolute inset-0 text-[15px] leading-relaxed ${i === 0 ? "text-paper/75" : "text-ink-soft"}`}>
                  {s.summary ?? "Ayrıntıları sayfada inceleyin."}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Hizmete özgü mini arayüz (tamamen CSS, rakam yok). */
function ServiceUi({ slug, dark }: { slug: string; dark: boolean }) {
  const card = dark ? "bg-white/8 border-white/10" : "bg-paper border-line";
  const bar = dark ? "bg-white/20" : "bg-ink/15";
  if (slug.includes("e-ticaret")) {
    return (
      <div className="grid h-full grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex flex-col rounded-2xl border p-2 ${card}`}>
            <div className={`aspect-square rounded-xl ${["bg-accent/70", "bg-ultra/60", "bg-volt/70"][i]}`} />
            <div className={`mt-2 h-2 w-3/4 rounded-full ${bar}`} />
            <span className="mt-auto rounded-full bg-accent py-1 text-center text-[10px] font-semibold text-accent-ink">Sepete ekle</span>
          </div>
        ))}
      </div>
    );
  }
  if (slug.includes("seo") || slug.includes("google-ads")) {
    const ads = slug.includes("google-ads");
    return (
      <div className={`h-full rounded-2xl border p-3 ${card}`}>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${card}`}><span className="text-muted">⌕</span> web tasarım</div>
        {[0, 1].map((i) => (
          <div key={i} className="mt-3">
            <p className="text-[10px] text-muted">{ads && i === 0 ? "Sponsorlu · " : ""}webtasarimajansi.net</p>
            <div className={`mt-1 h-2 rounded-full ${i === 0 ? "w-4/5 bg-ultra/70" : `w-3/5 ${bar}`}`} />
            <div className={`mt-1 h-1.5 w-full rounded-full ${bar} opacity-60`} />
          </div>
        ))}
      </div>
    );
  }
  if (slug.includes("yazilim")) {
    return (
      <div className="h-full rounded-2xl bg-night p-3 font-mono text-[11px] leading-5 text-snow/80">
        <p><span className="text-ultra">const</span> teklif = <span className="text-volt">await</span> kaydet(form);</p>
        <p><span className="text-ultra">if</span> (teklif.ok) bildir(<span className="text-signal-2">&quot;satış&quot;</span>);</p>
        <p className="text-snow/40">{"// işinize özel akış"}</p>
        <span className="caret inline-block h-3.5 w-1.5 translate-y-0.5 bg-signal" />
      </div>
    );
  }
  if (slug.includes("fiyat")) {
    return (
      <div className={`h-full rounded-2xl border p-3 ${card}`}>
        {["Tasarım", "İçerik", "Geliştirme", "SEO altyapısı"].map((t) => (
          <div key={t} className="flex items-center justify-between border-b border-current/10 py-1.5 text-[12px] last:border-0">
            <span>{t}</span><span className={`h-2 w-12 rounded-full ${bar}`} />
          </div>
        ))}
      </div>
    );
  }
  if (slug.includes("yaptirma")) {
    return (
      <div className={`h-full rounded-2xl border p-3 ${card}`}>
        {["Keşif görüşmesi", "Tasarım onayı", "Geliştirme", "Yayın"].map((t, i) => (
          <div key={t} className="flex items-center gap-3 py-1 text-[12px]">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${i < 3 ? "bg-accent text-accent-ink" : `border ${dark ? "border-white/30" : "border-ink/25"}`}`}>{i < 3 ? "✓" : ""}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    );
  }
  if (slug.includes("ajans")) {
    return (
      <div className="flex h-full flex-wrap content-start gap-2">
        {["Strateji", "UX", "Tasarım", "Yazılım", "SEO", "İçerik", "Ölçüm"].map((t, i) => (
          <span key={t} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${["bg-accent text-accent-ink", "bg-ultra text-white", dark ? "bg-white/10" : "bg-ink text-paper"][i % 3]}`}>{t}</span>
        ))}
      </div>
    );
  }
  // Kurumsal / genel web tasarım: sayfa iskeleti + renk ve tipografi seçimi
  return (
    <div className="grid h-full grid-cols-[1.5fr_1fr] gap-2">
      <div className={`flex flex-col rounded-2xl border p-3 ${card}`}>
        <div className={`h-2 w-1/3 rounded-full ${bar}`} />
        <p className="mt-3 font-display text-xl leading-none">Aa</p>
        <div className={`mt-2 h-2 w-4/5 rounded-full ${bar}`} />
        <div className={`mt-1 h-2 w-3/5 rounded-full ${bar}`} />
        <span className="mt-auto h-5 w-20 rounded-full bg-accent" />
      </div>
      <div className="grid gap-2">
        {["bg-accent", "bg-ultra", dark ? "bg-snow" : "bg-ink"].map((c) => <div key={c} className={`rounded-xl ${c}`} />)}
      </div>
    </div>
  );
}

/* ─── 6. Süreç 01–07 ──────────────────────────────────────────────────────── */
const STEPS = [
  ["Strateji", "İşinizi, müşterilerinizi ve rakiplerinizi konuşuyor; hangi aramalarda görünmeniz gerektiğini belirliyoruz."],
  ["UX", "Arama niyetine göre sayfa yapısı ve kullanıcı yolu. Her sayfanın tek bir görevi var."],
  ["UI", "Markanıza ait renk, tipografi ve bileşenler; önce telefonda, sonra büyük ekranda."],
  ["Geliştirme", "Hızlı, erişilebilir ve Google'ın ilk taramada anlayacağı temiz HTML."],
  ["SEO", "Başlıklar, meta açıklamalar, iç linkler ve yapılandırılmış veri sayfayla birlikte kurulur."],
  ["Yayın", "Yönlendirmeler, site haritası ve Search Console bağlantısıyla kontrollü yayın."],
  ["Optimizasyon", "Ölçüm, düzenli içerik ve iyileştirme. Neyin neden yapıldığını görürsünüz."],
] as const;

function Process() {
  return (
    <section aria-labelledby="surec" className="mx-auto mt-28 max-w-7xl scroll-mt-24 px-4 sm:mt-36 sm:px-6">
      <p data-reveal className={`${EYEBROW} text-accent`}>Süreç</p>
      <h2 id="surec" data-reveal className={`mt-4 max-w-3xl ${H2}`}>Yedi adımda, <span className="italic">katman katman.</span></h2>
      <div data-steps className="mt-14 grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <ol className="lg:pb-[14vh] lg:pt-[6vh]">
          {STEPS.map(([t, d], i) => (
            <li key={t} data-step data-title={t} className="step grid grid-cols-[auto_1fr] gap-5 border-t border-line py-7 lg:min-h-[22vh]">
              <span className="font-display text-4xl text-accent">0{i + 1}</span>
              <div>
                <h3 className="text-2xl font-semibold">{t}</h3>
                <p className="mt-2 max-w-md leading-relaxed text-ink-soft">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div aria-hidden className="hidden lg:block">
          <div className="sticky top-28">
            <BuildMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Adım ilerledikçe katmanları yanan site: 0 iskelet → 6 ölçüm. */
function BuildMockup() {
  return (
    <div className="stage relative overflow-hidden rounded-[32px] p-6">
      <div className="stage-grid pointer-events-none absolute inset-0 opacity-70" />
      <p className="relative mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-snow/60">
        <span className="h-2 w-2 rounded-full bg-signal" /> Şu an: <span data-step-label className="text-snow">Strateji</span>
      </p>
      <div className="relative">
        <BrowserFrame url="markaniz.com.tr" dark>
          <div className="relative aspect-[4/3.1] p-5 [container-type:inline-size]">
            {/* 0 Strateji: site haritası */}
            <div data-layer="0" className="build-layer flex items-center gap-[2cqw] text-[2.4cqw] text-snow/60">
              {["Ana sayfa", "Hizmetler", "Sektörler", "İletişim"].map((t) => <span key={t} className="rounded-full border border-white/15 px-[2cqw] py-[.6cqw]">{t}</span>)}
            </div>
            {/* 1 UX: yerleşim blokları */}
            <div data-layer="1" className="build-layer mt-[4cqw] grid grid-cols-[1.4fr_1fr] gap-[3cqw]">
              <div className="space-y-[2cqw]">
                <div className="h-[9cqw] rounded-[2cqw] border border-dashed border-white/25" />
                <div className="h-[2cqw] w-4/5 rounded-full bg-white/15" />
                <div className="h-[2cqw] w-3/5 rounded-full bg-white/15" />
              </div>
              <div className="rounded-[2cqw] border border-dashed border-white/25" />
            </div>
            {/* 2 UI: renk + tipografi */}
            <div data-layer="2" className="build-layer mt-[3cqw] flex items-center gap-[2cqw]">
              <span className="font-display text-[7cqw] leading-none text-snow">Aa</span>
              {["bg-signal", "bg-ultra", "bg-volt", "bg-snow"].map((c) => <span key={c} className={`h-[5cqw] w-[5cqw] rounded-full ${c}`} />)}
              <span className="ml-auto rounded-full bg-signal px-[3cqw] py-[1.4cqw] text-[2.4cqw] font-semibold text-white">Teklif Al</span>
            </div>
            {/* 3 Geliştirme: kod */}
            <div data-layer="3" className="build-layer mt-[3cqw] rounded-[2cqw] bg-black/40 p-[2.4cqw] font-mono text-[2.3cqw] leading-[1.6] text-snow/75">
              <p>&lt;<span className="text-ultra">main</span>&gt; &lt;<span className="text-ultra">h1</span>&gt;Tek başlık&lt;/<span className="text-ultra">h1</span>&gt;</p>
              <p className="text-snow/40">{"<!-- hızlı, erişilebilir HTML -->"}</p>
            </div>
            {/* 4 SEO: arama önizlemesi */}
            <div data-layer="4" className="build-layer mt-[3cqw] rounded-[2cqw] bg-white p-[2.4cqw] text-[#14161a]">
              <p className="text-[2cqw] text-[#4d5156]">markaniz.com.tr › hizmetler</p>
              <p className="text-[3cqw] text-[#1a0dab]">Başlık · Açıklama · Schema</p>
            </div>
            {/* 5 Yayın + 6 Optimizasyon: rozetler */}
            <div className="mt-[3cqw] flex items-center gap-[2cqw]">
              <span data-layer="5" className="build-layer chip bg-volt/90 !text-[2.3cqw] text-night"><span className="h-[1.4cqw] w-[1.4cqw] rounded-full bg-night" /> Yayında</span>
              <div data-layer="6" className="build-layer ml-auto flex h-[9cqw] items-end gap-[1cqw]">
                {[35, 50, 45, 65, 80].map((h, i) => <span key={i} className="w-[2.6cqw] rounded-t-[.6cqw] bg-gradient-to-t from-signal to-signal-2" style={{ height: `${h}%` }} />)}
              </div>
            </div>
          </div>
        </BrowserFrame>
      </div>
      <p className="relative mt-4 text-xs text-snow/45">Temsili çizim: bir sitenin adım adım nasıl oluştuğunu gösterir.</p>
    </div>
  );
}

/* ─── 7. SEO (SERP) ───────────────────────────────────────────────────────── */
function Seo() {
  const facts = [
    ["Arama niyeti", "Her sayfa tek bir aramaya ve tek bir göreve göre kurulur."],
    ["Teknik temel", "Canonical, site haritası, robots ve yapılandırılmış veri sayfayla birlikte gelir."],
    ["İç bağlantılar", "Hizmet, sektör ve rehber sayfaları birbirini doğal bağlamda işaret eder."],
    ["Ölçüm", "Search Console verisiyle neyin işe yaradığı izlenir; tahmin değil, veri."],
  ];
  const results = [
    { from: 2, to: 1, you: false },
    { from: 0, to: 2, you: false },
    { from: 1, to: 0, you: true },
  ];
  return (
    <section aria-labelledby="seo" className="stage relative mt-28 overflow-hidden py-24 sm:mt-36 sm:py-32">
      <div aria-hidden className="glow-ultra pointer-events-none absolute -right-40 top-0 h-[560px] w-[560px] rounded-full" />
      <div className="relative mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p data-reveal className={`${EYEBROW} text-signal`}>SEO</p>
          <h2 id="seo" data-reveal className={`mt-4 ${H2}`}>Google&apos;ın anladığı, <span className="italic text-signal-2">insanın tıkladığı.</span></h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {facts.map(([t, d], i) => (
              <li key={t} data-reveal style={{ "--d": `${i * 80}ms` } as React.CSSProperties} className="border-t border-white/12 pt-4">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-snow/60">{d}</p>
              </li>
            ))}
          </ul>
          <Link href="/seo-hizmeti" className="mt-10 inline-flex items-center gap-2 font-semibold text-snow underline decoration-signal underline-offset-[6px]">
            SEO hizmetini inceleyin <span aria-hidden>→</span>
          </Link>
        </div>

        <div data-reveal="scale" aria-hidden className="relative">
          <div className="rounded-[28px] bg-white p-5 text-[#202124] shadow-2xl sm:p-7">
            <div className="flex items-center gap-3 rounded-full border border-[#dfe1e5] px-4 py-2.5 text-sm">
              <span className="text-[#9aa0a6]">⌕</span> kurumsal web tasarım
            </div>
            <div className="relative mt-5 h-[258px]">
              {results.map((r, i) => (
                <div key={i} className="serp-item absolute inset-x-0 top-0 h-[86px]" style={{ "--from": r.from, "--to": r.to } as React.CSSProperties}>
                  <div className={`rounded-2xl p-3 ${r.you ? "bg-[#fff4ef] ring-1 ring-[#ff4d1f]/40" : ""}`}>
                    <p className="text-xs text-[#4d5156]">{r.you ? "webtasarimajansi.net › kurumsal-web-tasarim" : "ornek-site.com › sayfa"}</p>
                    {r.you
                      ? <p className="mt-1 truncate text-lg text-[#1a0dab]">Kurumsal Web Tasarım — net, hızlı, güven veren</p>
                      : <div className="mt-2 h-3.5 w-3/4 rounded-full bg-[#1a0dab]/25" />}
                    <div className="mt-2 h-2.5 w-full rounded-full bg-[#dfe1e5]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-xs text-snow/45">Temsili arama sonucu görünümü. Sıralama garantisi verilmez; hedef, doğru aramada anlaşılır bir sonuçla görünmektir.</p>
        </div>
      </div>
    </section>
  );
}

/* ─── 8. Kanıt (yalnızca gerçek sayılar) ──────────────────────────────────── */
function Proof({ stats, html }: { stats: Awaited<ReturnType<typeof getHomeStats>>; html: string }) {
  const items = [
    stats.avgSeo != null && { n: stats.avgSeo, suffix: "/100", label: "Ortalama SEO skoru", note: `${stats.scored} yayındaki sayfa, kendi analiz motorumuzla` },
    { n: stats.published, label: "Yayındaki sayfa", note: "Bu sitede, şu an" },
    { n: stats.services, label: "Hizmet sayfası", note: "Her biri kendi aramasına göre" },
    { n: stats.sectors, label: "Sektör sayfası", note: "Sektöre özel içerik" },
    { n: stats.guides, label: "Rehber yazısı", note: "Karar öncesi okunacaklar" },
  ].filter(Boolean) as { n: number; suffix?: string; label: string; note: string }[];
  return (
    <section aria-labelledby={html.trim() ? "yaklasim" : undefined} aria-label={html.trim() ? undefined : "Rakamlar"} className="mx-auto mt-28 max-w-7xl px-4 sm:mt-36 sm:px-6">
      <div className="grid gap-px overflow-hidden rounded-[32px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it, i) => (
          <div key={it.label} data-reveal style={{ "--d": `${i * 70}ms` } as React.CSSProperties} className="bg-card p-6">
            <p className="font-display text-5xl leading-none tracking-tight">
              <span data-count={it.n}>{it.n}</span>{it.suffix && <span className="text-xl text-muted">{it.suffix}</span>}
            </p>
            <p className="mt-3 font-semibold">{it.label}</p>
            <p className="mt-1 text-sm text-muted">{it.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Sayılar bu sitenin veritabanından canlı gelir; müşteri sonucu değildir.</p>

      {html.trim() && (
        <div className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div data-reveal>
            <p className={`${EYEBROW} text-accent`}>Yaklaşım</p>
            <h2 id="yaklasim" className="mt-4 font-display text-[clamp(2rem,1.5rem+2vw,3.2rem)] leading-[1]">Nasıl çalışıyoruz?</h2>
          </div>
          <div data-reveal style={{ "--d": "120ms" } as React.CSSProperties}><Prose html={html} /></div>
        </div>
      )}
    </section>
  );
}

/* ─── 9. Kapanış ──────────────────────────────────────────────────────────── */
function FinalCta({ whatsapp }: { whatsapp: string }) {
  return (
    <section aria-labelledby="baslayalim" data-live className="px-4 pt-28 sm:px-6">
      <div data-reveal="scale" className="stage relative mx-auto max-w-7xl overflow-hidden rounded-[40px] px-6 py-20 text-center sm:px-12 sm:py-28">
        <div aria-hidden className="stage-grid pointer-events-none absolute inset-0" />
        <div aria-hidden className="glow-signal float-slow pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <p className="relative chip mx-auto border border-white/12 bg-white/5 text-snow/80"><span className="blink h-1.5 w-1.5 rounded-full bg-volt" /> Yeni projelere açığız</p>
        <h2 id="baslayalim" className="relative mx-auto mt-7 max-w-4xl font-display text-[clamp(2.6rem,1.4rem+5vw,6rem)] leading-[0.95] tracking-[-0.03em]">
          Bir sonraki web sitenizi <span className="text-gradient italic">birlikte tasarlayalım.</span>
        </h2>
        <p className="relative mx-auto mt-6 max-w-xl text-lg text-snow/65">
          Hedeflerinizi ve varsa mevcut sitenizi konuşalım; size uygun kapsamı ve kalem kalem açıklanmış bir teklif hazırlayalım.
        </p>
        <div className="relative mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/teklif-al" className="cta-magnet inline-flex items-center gap-2 rounded-full bg-signal px-8 py-4 font-semibold text-white">
            Projenizi Başlatalım <span aria-hidden className="arrow">→</span>
          </Link>
          <Link href="/teklif-al#on-analiz" className="rounded-full border border-white/20 px-8 py-4 font-semibold text-snow hover:border-white">Ücretsiz Ön Analiz</Link>
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Merhaba, web siteniz üzerinden yazıyorum.")}`} rel="noopener" className="rounded-full border border-white/20 px-8 py-4 font-semibold text-snow hover:border-white">
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
