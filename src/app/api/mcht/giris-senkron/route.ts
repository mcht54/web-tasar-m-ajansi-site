import { apply, SyncError, verify } from "@/lib/auth/panel-sync";

// MCHT Panel giriş senkronu (bkz. src/lib/auth/panel-sync.ts). Oturum çerezi kullanmaz; HMAC imzası + zaman + nonce.
export async function POST(req: Request) {
  try {
    const data = await verify(await req.text(), req.headers.get("x-mcht-zaman") ?? "", req.headers.get("x-mcht-imza") ?? "");
    if (data.islem === "ping") return Response.json({ ok: true, site: "webtasarimajansi.net", surum: 1 });
    if (data.islem !== "kaydet") throw new SyncError(400, "Bilinmeyen işlem.");
    return Response.json(await apply(data));
  } catch (e) {
    if (e instanceof SyncError) return Response.json({ ok: false, hata: e.message }, { status: e.status });
    console.error("giris-senkron: beklenmeyen hata", e instanceof Error ? e.name : "hata");
    return Response.json({ ok: false, hata: "Sunucu hatası." }, { status: 500 });
  }
}
