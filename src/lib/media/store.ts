import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "../db";
import { mediaDir } from "../env";
import { slugify } from "../text/slug";
import type { MediaVariant } from "./urls";

const WIDTHS = [640, 1280, 1920];
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

async function uniqueBase(base: string): Promise<string> {
  let name = base || "gorsel";
  for (let i = 2; await db.media.findFirst({ where: { filename: { startsWith: `${name}.` } } }); i++) name = `${base}-${i}`;
  return name;
}

/**
 * Görseli WebP (ana dosya) + AVIF/WebP varyantlarına dönüştürür. EXIF (konum vb.)
 * sharp varsayılanıyla silinir. SVG kabul edilmez (script taşıyabilir).
 */
export async function storeUpload(file: File, meta: { seoName?: string; alt?: string; title?: string; caption?: string }) {
  if (!ALLOWED.has(file.type)) throw new Error("Yalnızca JPG, PNG, WebP, AVIF veya GIF yüklenebilir");
  if (file.size > MAX_BYTES) throw new Error("Dosya 10 MB'tan büyük olamaz");
  const input = Buffer.from(await file.arrayBuffer());
  const img = sharp(input, { failOn: "error" }).rotate();
  const info = await img.metadata();
  if (!info.width || !info.height) throw new Error("Görsel okunamadı");
  const base = await uniqueBase(slugify(meta.seoName || file.name.replace(/\.[^.]+$/, "")).slice(0, 80));
  const dir = path.resolve(mediaDir());
  await mkdir(dir, { recursive: true });
  const variants: MediaVariant[] = [];
  const maxW = Math.min(info.width, 2400);
  const main = await img.clone().resize({ width: maxW, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  await writeFile(path.join(dir, `${base}.webp`), main.data);
  for (const w of WIDTHS.filter((x) => x < maxW).concat(maxW)) {
    for (const format of ["avif", "webp"] as const) {
      const out = await img.clone().resize({ width: w, withoutEnlargement: true })[format]({ quality: format === "avif" ? 55 : 78 }).toBuffer();
      const file_ = `${base}-${w}.${format}`;
      await writeFile(path.join(dir, file_), out);
      variants.push({ file: file_, width: w, format, bytes: out.length });
    }
  }
  return db.media.create({
    data: {
      filename: `${base}.webp`, originalName: file.name.slice(0, 200), mime: "image/webp",
      width: main.info.width, height: main.info.height, bytes: main.data.length,
      alt: meta.alt?.trim() || null, title: meta.title?.trim() || null, caption: meta.caption?.trim() || null, variants,
    },
  });
}

export async function deleteMedia(id: string) {
  const m = await db.media.findUniqueOrThrow({ where: { id } });
  const inUse = await db.page.findMany({ where: { OR: [{ ogImageId: id }, { body: { contains: `/medya/${m.filename}` } }] }, select: { path: true } });
  if (inUse.length) throw new Error(`Görsel kullanımda: ${inUse.map((p) => p.path).join(", ")}`);
  const dir = path.resolve(mediaDir());
  for (const f of [m.filename, ...(m.variants as MediaVariant[]).map((v) => v.file)]) await unlink(path.join(dir, f)).catch(() => {});
  await db.media.delete({ where: { id } });
}
