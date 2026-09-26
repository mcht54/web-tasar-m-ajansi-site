import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPage, getSiteChrome } from "./public";
import { pageMetadata } from "./seo-render";
import { absoluteUrl } from "../env";
import { mediaUrl } from "../media/urls";
import { db } from "../db";
import { PageView } from "@/components/site/PageView";

async function ogFallback(id: string): Promise<string | null> {
  if (!id) return null;
  const m = await db.media.findUnique({ where: { id }, select: { filename: true } });
  return m ? absoluteUrl(mediaUrl(m.filename)) : null;
}

export async function metadataFor(path: string): Promise<Metadata> {
  const page = await getPublicPage(path);
  if (!page) return { title: "Sayfa bulunamadı", robots: { index: false } };
  const { settings } = await getSiteChrome();
  return pageMetadata(page, settings, await ogFallback(settings.seo.defaultOgImageId));
}

export async function renderPath(path: string) {
  const page = await getPublicPage(path);
  if (!page) notFound();
  const { settings, graph, logo } = await getSiteChrome();
  return <PageView page={page} settings={settings} graph={graph} logoUrl={logo?.url ?? null} />;
}

/** URL parçalarından veritabanındaki yol anahtarını üretir. */
export function pathFromSegments(segments: string[]): string {
  return "/" + segments.map((s) => decodeURIComponent(s)).join("/");
}
