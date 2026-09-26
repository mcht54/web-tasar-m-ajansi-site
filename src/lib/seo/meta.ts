// Başlık, açıklama, robots ve canonical çözümlemesi (saf fonksiyonlar).

import type { SeoSettings } from "../settings-schema";

export type MetaInput = {
  path: string;
  type: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  name: string;
  h1: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  intro: string | null;
  canonical: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  autoNoindex: boolean;
  autoNoindexReason?: string | null;
};

/** Sayfaya özel başlık varsa şablonu ezer; yoksa "%page%" şablonu uygulanır. */
export function resolveTitle(p: Pick<MetaInput, "seoTitle" | "name" | "type">, seo: SeoSettings): string {
  if (p.seoTitle?.trim()) return p.seoTitle.trim();
  if (p.type === "HOME") return seo.defaultTitle;
  const tpl = seo.titleTemplate.includes("%page%") ? seo.titleTemplate : "%page%";
  return tpl.replace("%page%", p.name).trim();
}

/** Açıklama yoksa girişten türetilir (kesilmiş, kelime ortasında bölünmez). */
export function resolveDescription(p: Pick<MetaInput, "metaDescription" | "intro">, seo: SeoSettings): string {
  if (p.metaDescription?.trim()) return p.metaDescription.trim();
  if (p.intro?.trim()) return truncate(p.intro.trim(), 158);
  return seo.defaultDescription;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

export type RobotsDecision = {
  index: boolean;
  follow: boolean;
  /** Google'a gönderilebilir mi (sitemap'e girer mi)? */
  indexable: boolean;
  reasons: string[];
};

export function resolveRobots(p: MetaInput, allowIndexing: boolean, selfCanonical: boolean): RobotsDecision {
  const reasons: string[] = [];
  if (p.status !== "PUBLISHED") reasons.push("Sayfa yayında değil");
  if (!allowIndexing) reasons.push("Site genelinde indeksleme kapalı");
  if (!p.robotsIndex) reasons.push("Sayfada NOINDEX seçili");
  if (p.autoNoindex) reasons.push(p.autoNoindexReason || "İçerik yetersiz olduğu için sistem NOINDEX yaptı");
  const index = p.status === "PUBLISHED" && allowIndexing && p.robotsIndex && !p.autoNoindex;
  if (index && !selfCanonical) reasons.push("Canonical başka bir URL'yi gösteriyor");
  return {
    index,
    follow: p.robotsFollow,
    indexable: index && selfCanonical,
    reasons,
  };
}

/** Canonical her zaman mutlak URL; boşsa sayfanın kendi temiz yolu. */
export function resolveCanonical(p: Pick<MetaInput, "canonical" | "path">, base: string): string {
  const c = p.canonical?.trim();
  if (c) return /^https?:\/\//i.test(c) ? c : base + (c.startsWith("/") ? c : `/${c}`);
  return p.path === "/" ? `${base}/` : base + p.path;
}

export function isSelfCanonical(p: Pick<MetaInput, "canonical" | "path">, base: string): boolean {
  const self = p.path === "/" ? `${base}/` : base + p.path;
  return resolveCanonical(p, base).replace(/\/$/, "") === self.replace(/\/$/, "");
}
