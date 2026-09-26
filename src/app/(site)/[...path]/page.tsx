import { metadataFor, pathFromSegments, renderPath } from "@/lib/site/render-page";

// Tüm SEO sayfaları (hizmet, il, ilçe, sektör, kombinasyon, blog) bu rotadan
// sunulur. İlk istekte üretilir, bir saat önbellekte kalır; yönetim panelinde
// kayıt yapıldığında ilgili yol anında tazelenir (ISR).
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/[...path]">) {
  const { path } = await props.params;
  return metadataFor(pathFromSegments(path));
}

export default async function CatchAll(props: PageProps<"/[...path]">) {
  const { path } = await props.params;
  return renderPath(pathFromSegments(path));
}
