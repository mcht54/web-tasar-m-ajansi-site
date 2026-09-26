import "server-only";
import type { Metadata } from "next";
import type { AllSettings } from "../settings-schema";
import { absoluteUrl, siteUrl } from "../env";
import { isSelfCanonical, resolveCanonical, resolveDescription, resolveRobots, resolveTitle } from "../seo/meta";
import { buildJsonLd, jsonLdScript } from "../seo/schema";
import type { Crumb } from "../seo/breadcrumbs";
import type { PublicPage } from "./public";
import { mediaUrl } from "../media/urls";

type P = PublicPage & { faqItems: { q: string; a: string }[] };

export function pageMetadata(p: P, settings: AllSettings, ogFallback: string | null): Metadata {
  const base = siteUrl();
  const title = resolveTitle(p, settings.seo);
  const description = resolveDescription(p, settings.seo);
  const canonical = resolveCanonical(p, base);
  const robots = resolveRobots(p, settings.seo.allowIndexing, isSelfCanonical(p, base));
  // Öncelik: sayfaya özel görsel > varsayılan görsel (ayarlar) > otomatik üretilen görsel
  const image = p.ogImage
    ? absoluteUrl(mediaUrl(p.ogImage.filename))
    : (ogFallback ?? absoluteUrl(`/og${p.path === "/" ? "/_home" : p.path}`));
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Tam alıntı ve büyük görsel önizlemesine izin: Google ve AI yanıtları metni kaynak olarak kullanabilsin.
    robots: {
      index: robots.index, follow: robots.follow,
      ...(robots.index ? { "max-snippet": -1, "max-image-preview": "large" as const, "max-video-preview": -1 } : {}),
      googleBot: { index: robots.index, follow: robots.follow, ...(robots.index ? { "max-snippet": -1, "max-image-preview": "large" as const } : {}) },
    },
    openGraph: {
      type: p.type === "BLOG_POST" ? "article" : "website",
      url: canonical,
      title: p.ogTitle || title,
      description: p.ogDescription || description,
      siteName: settings.site.siteName,
      locale: "tr_TR",
      images: [{ url: image, ...(p.ogImage ? { width: p.ogImage.width, height: p.ogImage.height } : ogFallback ? {} : { width: 1200, height: 630 }), alt: p.h1 || p.name }],
      ...(p.type === "BLOG_POST"
        ? { publishedTime: p.publishedAt ?? undefined, modifiedTime: p.contentUpdatedAt }
        : {}),
    },
    twitter: { card: "summary_large_image", images: [image], title: p.ogTitle || title, description: p.ogDescription || description },
    ...(p.type === "HOME"
      ? {
          verification: {
            ...(settings.integrations.gscVerification ? { google: settings.integrations.gscVerification } : {}),
            ...(settings.integrations.yandexVerification ? { yandex: settings.integrations.yandexVerification } : {}),
            ...(settings.integrations.bingVerification ? { other: { "msvalidate.01": settings.integrations.bingVerification } } : {}),
          },
        }
      : {}),
  };
}

export function pageJsonLd(p: P, settings: AllSettings, crumbs: Crumb[], logoUrl: string | null): string {
  const base = siteUrl();
  const nodes = buildJsonLd(
    {
      type: p.type,
      path: p.path,
      name: p.name,
      h1: p.h1 || p.name,
      description: resolveDescription(p, settings.seo),
      faq: p.faqItems,
      publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
      updatedAt: new Date(p.contentUpdatedAt),
      authorName: p.authorName,
      imageUrl: p.ogImage ? absoluteUrl(mediaUrl(p.ogImage.filename)) : absoluteUrl(`/og${p.path === "/" ? "/_home" : p.path}`),
      serviceName: p.service?.name ?? null,
      provinceName: p.province?.name ?? null,
      districtName: p.district?.name ?? null,
      sectorName: p.sector?.name ?? null,
      disabled: p.schemaDisabled,
    },
    { base, site: settings.site, business: settings.business, logoUrl: logoUrl ? absoluteUrl(logoUrl) : null, crumbs },
  );
  return jsonLdScript(nodes);
}
