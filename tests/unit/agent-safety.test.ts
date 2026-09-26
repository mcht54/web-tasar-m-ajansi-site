// Favicon dosyalarının geçerliliği ve SEO ajanının dokunamayacağı alanlar (statik denetim).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("favicon", () => {
  it("favicon.ico gerçek ICO: 16, 32 ve 48 piksel PNG içerir", () => {
    const b = readFileSync("src/app/favicon.ico");
    expect(b.readUInt16LE(0)).toBe(0); // reserved
    expect(b.readUInt16LE(2)).toBe(1); // tür: ikon
    const count = b.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => b.readUInt8(6 + i * 16) || 256);
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < count; i++) {
      const off = b.readUInt32LE(6 + i * 16 + 12);
      expect(b.subarray(off, off + 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG imzası
    }
  });
  it("apple-touch-icon 180×180, manifest ikonları 192/512 PNG ve SVG ikon yerel", () => {
    const dims = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    expect(dims("src/app/apple-icon.png")).toEqual([180, 180]);
    expect(dims("public/icons/icon-192.png")).toEqual([192, 192]);
    expect(dims("public/icons/icon-512.png")).toEqual([512, 512]);
    const svg = readFileSync("src/app/icon.svg", "utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // harici kaynak yok
    const manifest = readFileSync("src/app/manifest.ts", "utf8");
    expect(manifest).toContain("/icons/icon-192.png");
    expect(manifest).toContain("/icons/icon-512.png");
  });
});

describe("SEO ajanı güvenlik sınırı", () => {
  it("ajan kodu yönetici hesaplarına, şifrelere, sırlara, oturumlara veya ayarlara yazamaz", () => {
    const dir = "src/lib/autopilot";
    const forbidden = [/db\.user\./, /db\.session\./, /db\.secret\./, /db\.setting\./, /\bsetSecret\(/, /\bdeleteSecret\(/, /\bgetSecret\(/, /\bsaveSetting\(/, /hashPassword|passwordHash/, /process\.env\.(DATABASE_URL|APP_SECRET)/];
    const hits: string[] = [];
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const re of forbidden) if (re.test(src)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
  it("ajan yalnızca sayfa kaydetme yoluyla (sürüm geçmişi + yetki) içerik değiştirir; doğrudan sayfa güncellemesi yapmaz", () => {
    const dir = "src/lib/autopilot";
    const direct: string[] = [];
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      if (/db\.page\.(update|updateMany|delete|deleteMany|create|upsert)\(/.test(src)) direct.push(f);
    }
    expect(direct).toEqual([]);
  });
});
