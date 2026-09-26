// Breadcrumb: URL hiyerarşisinden türetilir. /web-tasarim/sakarya/adapazari →
// Ana Sayfa › Web Tasarım › Sakarya › Adapazarı. Yayında olmayan ara sayfalar
// atlanır (kırık link ve 404'e giden schema öğesi üretilmez).

import type { SiteGraph } from "./graph";

export type Crumb = { label: string; path: string };

export function buildBreadcrumbs(path: string, selfLabel: string, graph: SiteGraph): Crumb[] {
  if (path === "/") return [];
  const crumbs: Crumb[] = [{ label: "Ana Sayfa", path: "/" }];
  const segs = path.split("/").filter(Boolean);
  for (let i = 1; i < segs.length; i++) {
    const prefix = "/" + segs.slice(0, i).join("/");
    const node = graph.get(prefix);
    if (node?.published) crumbs.push({ label: node.crumb, path: prefix });
  }
  crumbs.push({ label: selfLabel, path });
  return crumbs;
}
