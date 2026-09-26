// Medya URL'leri: dosyalar /medya/<dosya> altında sunulur. Her görselin
// WebP ve AVIF varyantları farklı genişliklerde üretilir.

export type MediaVariant = { file: string; width: number; format: "webp" | "avif"; bytes: number };

export function mediaUrl(filename: string): string {
  return `/medya/${filename}`;
}

export function mediaSources(variants: MediaVariant[] | null | undefined): { type: string; srcset: string }[] {
  if (!variants?.length) return [];
  const out: { type: string; srcset: string }[] = [];
  for (const format of ["avif", "webp"] as const) {
    const list = variants.filter((v) => v.format === format).sort((a, b) => a.width - b.width);
    if (list.length) out.push({ type: `image/${format}`, srcset: list.map((v) => `${mediaUrl(v.file)} ${v.width}w`).join(", ") });
  }
  return out;
}
