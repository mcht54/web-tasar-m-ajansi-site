import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { hashPassword, passwordProblem } from "./password";

// MCHT Panel → bu site: yönetim girişi senkronu (protokol v1; panel tarafı mchttasarim-reklam-ajansi ajans/vault_sync.py).
// İstek: X-Mcht-Zaman (unix sn) · X-Mcht-Imza = hex(HMAC-SHA256(PANEL_SYNC_SECRET, zaman + "\n" + gövde)) · gövde {"gz": base64(gzip(JSON))}.
// PANEL_SYNC_SECRET yoksa uç kapalı (404). Zaman ±300 sn; nonce RateLimit tablosuna yazılır (tekrar oynatma reddedilir).
// Kullanıcı yoksa ADMIN açılır; varsa rolü değişmez. Şifre yalnız scrypt özeti olarak yazılır; oturumları silinir.

const WINDOW = 300;

export class SyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Payload = { v: number; islem: string; nonce: string; kimlik?: string | null; eslesme?: string | null; kullanici_adi?: string | null; eposta?: string | null; ad?: string | null; sifre?: string };

export async function verify(raw: string, stamp: string, signature: string, now = Date.now()): Promise<Payload> {
  const key = (process.env.PANEL_SYNC_SECRET ?? "").trim();
  if (key.length < 32) throw new SyncError(404, "Bulunamadı.");
  if (!/^\d{1,12}$/.test(stamp) || Math.abs(now / 1000 - Number(stamp)) > WINDOW) throw new SyncError(401, "Zaman damgası geçersiz (sunucu saatleri farklı olabilir).");
  const expected = Buffer.from(createHmac("sha256", key).update(`${stamp}\n${raw}`).digest("hex"));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new SyncError(401, "İmza geçersiz: panel ve sitedeki anahtar aynı değil.");
  let data: Payload;
  try { data = JSON.parse(gunzipSync(Buffer.from(JSON.parse(raw).gz, "base64")).toString("utf8")); } catch { throw new SyncError(400, "Gövde çözülemedi."); }
  if (!data || data.v !== 1) throw new SyncError(400, "Desteklenmeyen protokol sürümü.");
  if (typeof data.nonce !== "string" || data.nonce.length < 16 || data.nonce.length > 64) throw new SyncError(400, "Nonce eksik.");
  try {
    await db.rateLimit.create({ data: { key: `giris-senkron:${data.nonce}`, windowStart: new Date(Number(stamp) * 1000), count: 1 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new SyncError(409, "Bu istek daha önce işlendi (tekrar).");
    throw e;
  }
  return data;
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "") || null;

async function find(data: Payload) {
  if (data.kimlik) {
    const u = await db.user.findUnique({ where: { id: String(data.kimlik) } });
    if (u) return u;
  }
  for (const ident of [norm(data.eslesme), norm(data.kullanici_adi), norm(data.eposta)]) {
    if (!ident) continue;
    const u = await db.user.findFirst({ where: { OR: [{ email: ident }, { username: ident }] } });
    if (u) return u;
  }
  return null;
}

export async function apply(data: Payload): Promise<{ ok: true; kimlik: string; olusturuldu: boolean }> {
  const password = typeof data.sifre === "string" ? data.sifre : "";
  if (!password) throw new SyncError(422, "Şifre boş.");
  const problem = passwordProblem(password);
  if (problem) throw new SyncError(422, problem);
  const username = norm(data.kullanici_adi);
  const email = norm(data.eposta);
  if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) throw new SyncError(422, "Kullanıcı adı 3-40 karakter; küçük harf, rakam, nokta, tire, alt çizgi.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new SyncError(422, "Geçerli bir e-posta girin.");
  const passwordHash = await hashPassword(password);
  const existing = await find(data);
  try {
    if (!existing) {
      if (!email) throw new SyncError(422, "Bu sitede kullanıcı açmak için e-posta gerekir.");
      const name = (data.ad ?? "").trim().slice(0, 120) || username || email.split("@")[0];
      const u = await db.user.create({ data: { email, username, name, passwordHash, role: "ADMIN" } });
      await audit(null, "user.panel_sync", "User", u.id, { created: true });
      return { ok: true, kimlik: u.id, olusturuldu: true };
    }
    await db.$transaction([
      db.user.update({ where: { id: existing.id }, data: { email: email ?? existing.email, username: username ?? existing.username, passwordHash, failedLogins: 0, lockedUntil: null, active: true } }),
      db.session.deleteMany({ where: { userId: existing.id } }),
    ]);
    await audit(null, "user.panel_sync", "User", existing.id, { created: false });
    return { ok: true, kimlik: existing.id, olusturuldu: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new SyncError(409, "Bu e-posta ya da kullanıcı adı başka bir kullanıcıda kayıtlı.");
    throw e;
  }
}
