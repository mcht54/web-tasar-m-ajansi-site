// JSON-LD üretimi. Kural: yalnızca sayfada gerçekten görünen ve doğrulanmış
// bilgiden schema üretilir.
//  • LocalBusiness yalnızca işletme adı + telefon + adres girilmişse ve yalnızca
//    ana sayfa/iletişim sayfasında. Şehir sayfalarına "o şehirde şubemiz var"
//    anlamına gelecek LocalBusiness basılmaz (sahte işletme bilgisi olur).
//  • FAQPage yalnızca sayfada en az 2 görünür soru varsa.
//  • Sahte puan/yorum (AggregateRating/Review) hiçbir zaman üretilmez.

import { type BusinessSettings, type SiteSettings, businessIsComplete } from "../settings-schema";
import type { Crumb } from "./breadcrumbs";

export type SchemaPageInput = {
  type: string;
  path: string;
  name: string;
  h1: string;
  description: string;
  faq: { q: string; a: string }[];
  publishedAt: Date | null;
  updatedAt: Date;
  authorName: string | null;
  imageUrl: string | null;
  serviceName: string | null;
  provinceName: string | null;
  districtName: string | null;
  sectorName: string | null;
  disabled: string[];
};

export type SchemaContext = {
  base: string;
  site: SiteSettings;
  business: BusinessSettings;
  logoUrl: string | null;
  crumbs: Crumb[];
};

type Node = Record<string, unknown>;

const SERVICE_TYPES = new Set(["SERVICE", "SERVICE_LOCATION", "CITY", "DISTRICT", "SECTOR", "SECTOR_LOCATION"]);

export function autoSchemaTypes(type: string, path: string, faqCount: number, business: BusinessSettings): string[] {
  const t: string[] = ["WebPage"];
  if (type === "HOME") t.push("WebSite", organizationType(business));
  if (type === "STATIC" && path === "/iletisim") t.push(organizationType(business));
  if (path !== "/") t.push("BreadcrumbList");
  if (SERVICE_TYPES.has(type)) t.push("Service");
  if (type === "BLOG_POST") t.push("BlogPosting");
  if (faqCount >= 2) t.push("FAQPage");
  return t;
}

function organizationType(b: BusinessSettings): string {
  return b.type !== "Organization" && businessIsComplete(b) ? b.type : "Organization";
}

export function buildJsonLd(page: SchemaPageInput, ctx: SchemaContext): Node[] {
  const { base } = ctx;
  const url = page.path === "/" ? `${base}/` : base + page.path;
  const orgId = `${base}/#organization`;
  const enabled = autoSchemaTypes(page.type, page.path, page.faq.length, ctx.business).filter(
    (t) => !page.disabled.includes(t),
  );
  const nodes: Node[] = [];
  const orgName = ctx.business.name || ctx.site.siteName;

  for (const t of enabled) {
    switch (t) {
      case "WebSite":
        nodes.push({
          "@type": "WebSite",
          "@id": `${base}/#website`,
          url: `${base}/`,
          name: ctx.site.siteName,
          inLanguage: "tr-TR",
          publisher: { "@id": orgId },
        });
        break;

      case "Organization":
      case "LocalBusiness":
      case "ProfessionalService":
        nodes.push(organizationNode(t, orgId, orgName, ctx));
        break;

      case "WebPage": {
        const pageType =
          page.type === "BLOG_INDEX" ? "CollectionPage" : page.path === "/iletisim" ? "ContactPage" : "WebPage";
        nodes.push({
          "@type": pageType,
          "@id": `${url}#webpage`,
          url,
          name: page.h1,
          description: page.description,
          inLanguage: "tr-TR",
          isPartOf: { "@id": `${base}/#website` },
          ...(ctx.crumbs.length > 1 ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
          ...(page.imageUrl ? { primaryImageOfPage: page.imageUrl } : {}),
          dateModified: page.updatedAt.toISOString(),
        });
        break;
      }

      case "BreadcrumbList":
        if (ctx.crumbs.length > 1)
          nodes.push({
            "@type": "BreadcrumbList",
            "@id": `${url}#breadcrumb`,
            itemListElement: ctx.crumbs.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.label,
              // Son öğe (mevcut sayfa) için item URL'si isteğe bağlıdır; yine de veririz.
              item: c.path === "/" ? `${base}/` : base + c.path,
            })),
          });
        break;

      case "Service": {
        const country = { "@type": "Country", name: "Türkiye" };
        const province = page.provinceName ? { "@type": "AdministrativeArea", name: page.provinceName, containedInPlace: country } : null;
        const area = page.districtName && province
          ? { "@type": "AdministrativeArea", name: page.districtName, containedInPlace: province }
          : province ?? country;
        nodes.push({
          "@type": "Service",
          "@id": `${url}#service`,
          name: page.h1,
          serviceType: page.serviceName ?? (page.sectorName ? `${page.sectorName} web tasarımı` : "Web tasarım"),
          description: page.description,
          provider: { "@id": orgId },
          areaServed: area,
          url,
          ...(page.sectorName ? { audience: { "@type": "BusinessAudience", name: page.sectorName } } : {}),
        });
        break;
      }

      case "BlogPosting":
        nodes.push({
          "@type": "BlogPosting",
          "@id": `${url}#article`,
          headline: page.h1.slice(0, 110),
          description: page.description,
          mainEntityOfPage: { "@id": `${url}#webpage` },
          datePublished: (page.publishedAt ?? page.updatedAt).toISOString(),
          dateModified: page.updatedAt.toISOString(),
          author: page.authorName
            ? { "@type": "Person", name: page.authorName }
            : { "@id": orgId }, // aynı varlık tek @id ile (ayrı isimle yeniden tanımlanmaz)
          publisher: { "@id": orgId },
          inLanguage: "tr-TR",
          ...(page.imageUrl ? { image: [page.imageUrl] } : {}),
        });
        break;

      case "FAQPage":
        nodes.push({
          "@type": "FAQPage",
          "@id": `${url}#faq`,
          mainEntity: page.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        });
        break;
    }
  }
  // Organization başka sayfalarda referansla (@id) kullanılır; tanımı ana
  // sayfadadır. Referans veren sayfalarda da asgari tanım bulunsun diye ekleriz.
  if (!nodes.some((n) => n["@id"] === orgId) && nodes.some((n) => JSON.stringify(n).includes(orgId))) {
    nodes.push({ "@type": "Organization", "@id": orgId, name: orgName, url: `${base}/` });
  }
  return nodes;
}

function organizationNode(type: string, id: string, name: string, ctx: SchemaContext): Node {
  const b = ctx.business;
  const sameAs = Object.values(ctx.site.social).filter((v) => /^https?:\/\//.test(v));
  const node: Node = {
    "@type": type,
    "@id": id,
    name,
    url: `${ctx.base}/`,
    ...(b.legalName ? { legalName: b.legalName } : {}),
    ...(ctx.logoUrl ? { logo: ctx.logoUrl } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(b.email || ctx.site.email ? { email: b.email || ctx.site.email } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.foundingYear ? { foundingDate: String(b.foundingYear) } : {}),
    // Kurumun uzmanlık alanları: arama motorları ve AI yanıtları için varlık (entity) sinyali
    knowsAbout: b.services.length ? b.services : ["Web tasarım", "Kurumsal web sitesi", "E-ticaret sitesi", "SEO", "Google Ads", "Web yazılım"],
  };
  if (type !== "Organization") {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: b.street,
      addressLocality: b.district || b.city,
      addressRegion: b.city,
      ...(b.postalCode ? { postalCode: b.postalCode } : {}),
      addressCountry: "TR",
    };
    if (ctx.logoUrl) node.image = ctx.logoUrl;
    if (b.lat != null && b.lng != null) node.geo = { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng };
    if (b.openingHours.length)
      node.openingHoursSpecification = b.openingHours.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: h.days,
        opens: h.opens,
        closes: h.closes,
      }));
    if (b.priceRange) node.priceRange = b.priceRange;
    if (b.services.length)
      node.makesOffer = b.services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s } }));
  }
  return node;
}

export type SchemaIssue = { type: string; level: "error" | "warning"; message: string };

/** Üretilen JSON-LD'nin Google yönergelerine göre temel denetimi. */
export function validateJsonLd(nodes: Node[]): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const ids = new Set(nodes.map((n) => n["@id"]).filter(Boolean));
  for (const n of nodes) {
    const t = String(n["@type"]);
    const req = (field: string) => {
      if (n[field] == null || n[field] === "") issues.push({ type: t, level: "error", message: `${field} alanı eksik` });
    };
    switch (t) {
      case "BreadcrumbList": {
        const items = (n.itemListElement as Node[]) ?? [];
        if (items.length < 2) issues.push({ type: t, level: "error", message: "En az 2 öğe olmalı" });
        break;
      }
      case "BlogPosting":
        req("headline");
        req("datePublished");
        if (!n.image) issues.push({ type: t, level: "warning", message: "Görsel yok — Google makale görseli önerir (OG görseli ekleyin)" });
        break;
      case "FAQPage":
        if (((n.mainEntity as Node[]) ?? []).length < 2)
          issues.push({ type: t, level: "error", message: "En az 2 soru olmalı" });
        issues.push({
          type: t,
          level: "warning",
          message: "Google SSS zengin sonucunu çoğu site için göstermiyor; işaretleme yine de geçerlidir",
        });
        break;
      case "LocalBusiness":
      case "ProfessionalService":
        req("name");
        req("address");
        req("telephone");
        break;
      case "Organization":
        req("name");
        req("url");
        if (!n.logo) issues.push({ type: t, level: "warning", message: "Logo yok — Ayarlar'dan logo ekleyin" });
        break;
      case "Service":
        req("name");
        req("provider");
        break;
    }
    for (const ref of findRefs(n)) {
      if (!ids.has(ref)) issues.push({ type: t, level: "warning", message: `${ref} referansı bu sayfada tanımlı değil` });
    }
  }
  return issues;
}

function findRefs(n: unknown, out: string[] = [], depth = 0): string[] {
  if (!n || typeof n !== "object" || depth > 6) return out;
  const obj = n as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 1 && keys[0] === "@id" && typeof obj["@id"] === "string") out.push(obj["@id"]);
  else for (const v of Object.values(obj)) findRefs(v, out, depth + 1);
  return out;
}

export function jsonLdScript(nodes: Node[]): string {
  const doc = { "@context": "https://schema.org", "@graph": nodes };
  // </script> kaçışını engelle
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}
