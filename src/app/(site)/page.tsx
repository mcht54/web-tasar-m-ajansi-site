import { metadataFor, renderPath } from "@/lib/site/render-page";

export const revalidate = 3600;

export function generateMetadata() {
  return metadataFor("/");
}

export default function HomePage() {
  return renderPath("/");
}
