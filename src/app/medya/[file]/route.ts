import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { mediaDir } from "@/lib/env";

const TYPES: Record<string, string> = { webp: "image/webp", avif: "image/avif", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", ico: "image/x-icon" };

export async function GET(_req: Request, ctx: RouteContext<"/medya/[file]">) {
  const { file } = await ctx.params;
  // Yalnızca düz dosya adı: dizin atlama (../) mümkün değil.
  if (!/^[a-z0-9][a-z0-9._-]{0,180}$/.test(file)) return new Response("Bulunamadı", { status: 404 });
  const ext = file.split(".").pop()!;
  const type = TYPES[ext];
  if (!type) return new Response("Bulunamadı", { status: 404 });
  const full = path.join(path.resolve(mediaDir()), file);
  try {
    const [buf, st] = await Promise.all([readFile(full), stat(full)]);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(st.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        ...(ext === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
      },
    });
  } catch {
    return new Response("Bulunamadı", { status: 404 });
  }
}
