import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { type PageNode, SiteGraph, siteNav } from "../seo/graph";

export const PAGES_TAG = "pages";

type RawNode = Omit<PageNode, "publishedAt"> & { publishedAt: string | null };

async function loadNodes(): Promise<{ nodes: RawNode[]; navServiceIds: string[] }> {
  const [pages, services] = await Promise.all([
    db.page.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: {
        id: true, path: true, type: true, status: true, name: true, breadcrumbLabel: true,
        serviceId: true, provinceId: true, districtId: true, sectorId: true, category: true, publishedAt: true,
        service: { select: { slug: true, sortOrder: true } },
        sector: { select: { sortOrder: true } },
        province: { select: { region: true, lat: true, lng: true } },
        district: { select: { lat: true, lng: true } },
      },
    }),
    db.service.findMany({ where: { showInNav: true, active: true }, select: { id: true } }),
  ]);
  const nodes: RawNode[] = pages.map((p) => ({
    id: p.id,
    path: p.path,
    type: p.type,
    published: p.status === "PUBLISHED",
    name: p.name,
    anchor: p.name,
    crumb: p.breadcrumbLabel || p.name,
    serviceId: p.serviceId,
    serviceSlug: p.service?.slug ?? null,
    provinceId: p.provinceId,
    districtId: p.districtId,
    sectorId: p.sectorId,
    region: p.province?.region ?? null,
    lat: p.district?.lat ?? p.province?.lat ?? null,
    lng: p.district?.lng ?? p.province?.lng ?? null,
    category: p.category,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    sortOrder: p.service?.sortOrder ?? p.sector?.sortOrder ?? 0,
  }));
  return { nodes, navServiceIds: services.map((s) => s.id) };
}

function hydrate(raw: { nodes: RawNode[]; navServiceIds: string[] }) {
  const graph = new SiteGraph(
    raw.nodes.map((n) => ({ ...n, publishedAt: n.publishedAt ? new Date(n.publishedAt) : null })),
  );
  const nav = siteNav(graph, new Set(raw.navServiceIds));
  return { graph, nav };
}

/** Herkese açık render için önbellekli grafik (sayfa kaydında etiketle tazelenir). */
export const getSiteGraph = cache(async () =>
  hydrate(await unstable_cache(loadNodes, ["site-graph"], { tags: [PAGES_TAG], revalidate: 3600 })()),
);

/** Analiz/yönetim için önbelleksiz. */
export async function getSiteGraphFresh() {
  return hydrate(await loadNodes());
}
