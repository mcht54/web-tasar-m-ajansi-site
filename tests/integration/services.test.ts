import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decrypt, encrypt, hmac } from "@/lib/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { saveSetting, setSecret, deleteSecret, getSecret } from "@/lib/settings";
import { GSC_SECRET, syncGsc, updateRanksFromGsc } from "@/lib/gsc/sync";
import { runOpportunities } from "@/lib/seo/opportunities";
import { generateKeyPairSync } from "node:crypto";

describe("güvenlik yardımcıları", () => {
  it("şifre özeti doğrulanır, yanlış şifre reddedilir", async () => {
    const h = await hashPassword("GizliSifre12345");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("GizliSifre12345", h)).toBe(true);
    expect(await verifyPassword("yanlis", h)).toBe(false);
    expect(passwordProblem("kisa1")).toBeTruthy();
    expect(passwordProblem("uzunamarakamyok")).toBeTruthy();
  });
  it("AES-GCM şifreleme geri çözülür, değiştirilmiş veri reddedilir", () => {
    const box = encrypt("gizli veri");
    expect(decrypt(box)).toBe("gizli veri");
    expect(() => decrypt({ ...box, ciphertext: Buffer.from("bozuk").toString("base64") })).toThrow();
    expect(hmac("1.2.3.4")).not.toContain("1.2.3.4");
  });
  it("hız sınırı pencere içinde limiti aşınca durdurur", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("Search Console senkronu (sahte Google API)", () => {
  it("veriyi çeker, sıralama geçmişini üretir ve fırsat motorunu besler", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await setSecret(GSC_SECRET, JSON.stringify({
      type: "service_account", client_email: "test@proj.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    }));
    await saveSetting("integrations", { gscProperty: "sc-domain:webtasarimajansi.net" });
    const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
    const calls: string[] = [];
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("oauth2")) return Response.json({ access_token: "tok", expires_in: 3600 });
      const body = JSON.parse(String(init?.body ?? "{}"));
      const dims: string[] = body.dimensions;
      const rows = [];
      for (let d = 1; d <= 10; d++) {
        // "web tasarım sakarya": 12. sıradan 8'e yükseliyor
        const pos = 12 - (10 - d) * 0.4;
        const keys = dims.map((k) => (k === "date" ? day(d) : k === "query" ? "web tasarım sakarya" : "https://webtasarimajansi.net/web-tasarim"));
        rows.push({ keys, clicks: 1, impressions: 40, ctr: 0.025, position: pos });
      }
      return Response.json({ rows });
    }) as typeof fetch;
    const r = await syncGsc({ days: 10, fetchImpl: fakeFetch });
    expect(r.status).toBe("ok");
    expect(calls.some((c) => c.includes("searchAnalytics/query"))).toBe(true);
    expect(await db.gscDailyTotal.count()).toBeGreaterThan(0);
    const ranks = await updateRanksFromGsc();
    expect(ranks.status).toBe("ok");
    const kw = await db.keyword.findUniqueOrThrow({ where: { normalized: "web tasarım sakarya" } });
    expect(kw.currentPosition).toBeGreaterThan(7);
    expect(kw.currentPosition).toBeLessThan(9);
    expect(kw.serpUrl).toContain("/web-tasarim");
    const o = await runOpportunities();
    expect(o.status).toBe("ok");
    const quick = await db.seoTask.findFirst({ where: { code: "KEYWORD_QUICK_WIN", keywordId: kw.id } });
    expect(quick?.title).toMatch(/web tasarım sakarya.*→/);
    // kurulum görevi artık gerekmediği için otomatik kapanmış olmalı
    const setup = await db.seoTask.findUnique({ where: { fingerprint: "setup:gsc" } });
    if (setup) expect(setup.status).toBe("DONE");
  });

  it("temizlik", async () => {
    await deleteSecret(GSC_SECRET);
    expect(await getSecret(GSC_SECRET)).toBeNull();
    await db.rankSnapshot.deleteMany();
    await db.gscQueryDaily.deleteMany();
    await db.gscPageDaily.deleteMany();
    await db.gscDailyTotal.deleteMany();
    await db.keyword.updateMany({ data: { currentPosition: null, previousPosition: null, serpUrl: null, lastCheckedAt: null } });
    await saveSetting("integrations", {});
  });
});
