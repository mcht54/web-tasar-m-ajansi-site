// MCHT Panel giriş senkronu (protokol v1): imza/zaman/nonce zorunlu; kullanıcı yoksa ADMIN açılır, varsa şifre + giriş adı
// güncellenir ve oturumları silinir; şifre yalnız scrypt özeti olarak durur. Anahtar yoksa uç yok (404).
import { createHmac, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { POST } from "@/app/api/mcht/giris-senkron/route";

const KEY = "k".repeat(64);
const EMAILS = ["patron@senkron.test", "eleman@senkron.test"];

function send(data: Record<string, unknown>, opts: { key?: string; stamp?: number; nonce?: string } = {}) {
  const body = JSON.stringify({ gz: gzipSync(JSON.stringify({ v: 1, nonce: opts.nonce ?? randomBytes(16).toString("hex"), ...data })).toString("base64") });
  const stamp = String(opts.stamp ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.key ?? KEY).update(`${stamp}\n${body}`).digest("hex");
  return POST(new Request("https://webtasarimajansi.net/api/mcht/giris-senkron", { method: "POST", body, headers: { "X-Mcht-Zaman": stamp, "X-Mcht-Imza": sig } }));
}

const clean = () => db.user.deleteMany({ where: { email: { in: EMAILS } } });
beforeAll(async () => { process.env.PANEL_SYNC_SECRET = KEY; await clean(); });
afterAll(async () => { delete process.env.PANEL_SYNC_SECRET; await clean(); });

describe("panel giriş senkronu", () => {
  it("anahtar yoksa uç kapalı", async () => {
    delete process.env.PANEL_SYNC_SECRET;
    expect((await send({ islem: "ping" })).status).toBe(404);
    process.env.PANEL_SYNC_SECRET = KEY;
  });

  it("imza, zaman ve tekrar oynatma denetlenir", async () => {
    expect((await (await send({ islem: "ping" })).json()).ok).toBe(true);
    expect((await send({ islem: "ping" }, { key: "x".repeat(64) })).status).toBe(401);
    expect((await send({ islem: "ping" }, { stamp: Math.floor(Date.now() / 1000) - 1000 })).status).toBe(401);
    const nonce = randomBytes(16).toString("hex");
    expect((await send({ islem: "ping" }, { nonce })).status).toBe(200);
    expect((await send({ islem: "ping" }, { nonce })).status).toBe(409);
  });

  it("yoksa yönetici açar, sonra aynı kullanıcıyı günceller ve oturumlarını siler", async () => {
    const r1 = await (await send({ islem: "kaydet", kullanici_adi: "patron", eposta: EMAILS[0], ad: "Patron", sifre: "Ilk-Sifre-2026x" })).json();
    expect(r1.olusturuldu).toBe(true);
    let u = await db.user.findUniqueOrThrow({ where: { id: r1.kimlik } });
    expect(u.role).toBe("ADMIN");
    expect(await verifyPassword("Ilk-Sifre-2026x", u.passwordHash)).toBe(true);
    await db.session.create({ data: { id: randomBytes(16).toString("hex"), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const r2 = await (await send({ islem: "kaydet", kimlik: r1.kimlik, eslesme: "patron", kullanici_adi: "mucahit", eposta: EMAILS[0], sifre: "Yeni-Sifre-2027x" })).json();
    expect(r2).toEqual({ ok: true, kimlik: r1.kimlik, olusturuldu: false });
    u = await db.user.findUniqueOrThrow({ where: { id: r1.kimlik } });
    expect(u.username).toBe("mucahit");
    expect(u.passwordHash).not.toContain("Yeni-Sifre");
    expect(await verifyPassword("Yeni-Sifre-2027x", u.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("var olan kullanıcının rolü korunur, şifre kuralı uygulanır", async () => {
    const staff = await db.user.create({ data: { email: EMAILS[1], name: "Eleman", passwordHash: "x", role: "EDITOR" } });
    const bad = await send({ islem: "kaydet", eposta: EMAILS[1], sifre: "kisa1" });
    expect(bad.status).toBe(422);
    expect(await bad.text()).not.toContain("kisa1");
    const ok = await (await send({ islem: "kaydet", eposta: EMAILS[1], sifre: "Uzun-Sifre-12345" })).json();
    expect(ok.kimlik).toBe(staff.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).role).toBe("EDITOR");
  });
});
