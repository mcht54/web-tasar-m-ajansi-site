// Başlangıç verisi. Güvenle tekrar çalıştırılabilir:
//  • Lokasyon/hizmet/sektör olgusal verisi güncellenir.
//  • Sayfalar yalnızca YOKSA oluşturulur — editörün değişiklikleri ezilmez.
//  • İlk yönetici yalnızca hiç kullanıcı yoksa oluşturulur; şifre .local/ altına yazılır.

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type PageType, type Prisma } from "../src/generated/prisma/client";
import { normalizeKeyword, slugify, trLower } from "../src/lib/text/slug";
import { hashPassword } from "../src/lib/auth/password";
import { services } from "./content/services";
import { sectors } from "./content/sectors";
import { blogPosts } from "./content/blog";
import { homePage, staticPages } from "./content/static";
import type { SeedPage } from "./content/types";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Coğrafi bölgeler (plaka koduna göre)
const REGIONS: Record<string, number[]> = {
  Marmara: [10, 11, 16, 17, 22, 34, 39, 41, 54, 59, 77],
  Ege: [3, 9, 20, 35, 43, 45, 48, 64],
  Akdeniz: [1, 7, 15, 31, 32, 33, 46, 80],
  "İç Anadolu": [6, 18, 26, 38, 40, 42, 50, 51, 58, 66, 68, 70, 71],
  Karadeniz: [5, 8, 14, 19, 28, 29, 37, 52, 53, 55, 57, 60, 61, 67, 69, 74, 78, 81],
  "Doğu Anadolu": [4, 12, 13, 23, 24, 25, 30, 36, 44, 49, 62, 65, 75, 76],
  "Güneydoğu Anadolu": [2, 21, 27, 47, 56, 63, 72, 73, 79],
};
const regionOf = (plate: number) => Object.entries(REGIONS).find(([, ids]) => ids.includes(plate))?.[0] ?? "Bilinmiyor";

type Loc = {
  provinces: { id: number; name: string; lat: number; lng: number; area_km2: number }[];
  districts: { id: number; name: string; provinceId: number; lat: number; lng: number; area_km2: number }[];
};

async function seedLocations() {
  const data: Loc = JSON.parse(readFileSync(path.join(__dirname, "data/turkey_locations.json"), "utf8"));
  if (data.provinces.length !== 81) throw new Error(`81 il bekleniyordu, ${data.provinces.length} bulundu`);
  for (const p of data.provinces) {
    const fields = { name: p.name, slug: slugify(p.name), region: regionOf(p.id), lat: p.lat, lng: p.lng, areaKm2: p.area_km2 };
    await db.province.upsert({ where: { id: p.id }, create: { id: p.id, ...fields }, update: fields });
  }
  let n = 0;
  for (const d of data.districts) {
    const slug = slugify(d.name);
    const fields = { name: d.name, lat: d.lat, lng: d.lng, areaKm2: d.area_km2 };
    await db.district.upsert({
      where: { provinceId_slug: { provinceId: d.provinceId, slug } },
      create: { provinceId: d.provinceId, slug, ...fields },
      update: fields,
    });
    n++;
  }
  console.log(`✓ 81 il, ${n} ilçe`);
}

/**
 * Resmî nüfus ve idari veriler: TürkiyeAPI 2025 veri seti (kaynağı TÜİK ADNKS).
 * Dosyalar depoda sabit; çalışma anında dış servise bağımlılık yok.
 */
async function seedLocationFacts() {
  type Area = { value: number } | null;
  const provs: { id: number; population: number; area: Area; altitude: Area; isCoastal: boolean; isMetropolitan: boolean; stats: { municipalityCount: number; neighborhoodCount: number; villageCount: number } }[] =
    JSON.parse(readFileSync(path.join(__dirname, "data/turkiyeapi-2025-provinces.json"), "utf8"));
  const dists: { name: string; slug: string; provinceId: number; population: number; stats: { neighborhoodCount: number; villageCount: number } }[] =
    JSON.parse(readFileSync(path.join(__dirname, "data/turkiyeapi-2025-districts.json"), "utf8"));
  const SOURCE = "TürkiyeAPI 2025 veri seti (TÜİK ADNKS)";
  for (const p of provs) {
    await db.province.update({
      where: { id: p.id },
      data: {
        population: p.population, populationYear: 2025, dataSource: SOURCE, altitude: p.altitude?.value ?? null,
        isCoastal: p.isCoastal, isMetropolitan: p.isMetropolitan, municipalityCount: p.stats.municipalityCount,
        neighborhoodCount: p.stats.neighborhoodCount, villageCount: p.stats.villageCount,
      },
    });
  }
  const ours = await db.district.findMany({ select: { id: true, provinceId: true, slug: true } });
  const key = (pid: number, slug: string) => `${pid}:${slug}`;
  const index = new Map(ours.map((d) => [key(d.provinceId, d.slug), d.id]));
  let matched = 0;
  const missing: string[] = [];
  for (const d of dists) {
    const id = index.get(key(d.provinceId, slugify(d.name))) ?? index.get(key(d.provinceId, d.slug));
    if (!id) { missing.push(`${d.provinceId}/${d.name}`); continue; }
    await db.district.update({
      where: { id },
      data: { population: d.population, populationYear: 2025, dataSource: SOURCE, neighborhoodCount: d.stats.neighborhoodCount, villageCount: d.stats.villageCount },
    });
    matched++;
  }
  if (missing.length) throw new Error(`Eşleşmeyen ilçeler: ${missing.join(", ")}`);
  console.log(`✓ Resmî veriler: 81 il, ${matched} ilçe (nüfus 2025)`);
}

async function createPageIfMissing(
  p: SeedPage,
  type: PageType,
  extra: { status?: "DRAFT" | "PUBLISHED"; serviceId?: string; sectorId?: string; provinceId?: number; districtId?: number; publishedAt?: Date } = {},
) {
  const exists = await db.page.findUnique({ where: { path: p.path }, select: { id: true } });
  if (exists) return false;
  const status = extra.status ?? "PUBLISHED";
  await db.page.create({
    data: {
      path: p.path,
      type,
      status,
      name: p.name,
      breadcrumbLabel: p.crumb ?? null,
      seoTitle: p.seoTitle ?? null,
      metaDescription: p.metaDescription || null,
      h1: p.h1,
      intro: p.intro || null,
      body: p.body || null,
      faq: p.faq ?? [],
      primaryKeyword: p.primaryKeyword ?? null,
      secondaryKeywords: p.secondaryKeywords ?? [],
      excerpt: p.excerpt ?? null,
      category: p.category ?? null,
      robotsIndex: p.robotsIndex ?? true,
      publishedAt: extra.publishedAt ?? (status === "PUBLISHED" ? new Date() : null),
      serviceId: extra.serviceId,
      sectorId: extra.sectorId,
      provinceId: extra.provinceId,
      districtId: extra.districtId,
      versions: { create: { version: 1, snapshot: { seed: true, path: p.path }, note: "İlk içerik", userName: "Sistem" } },
    },
  });
  return true;
}

async function seedServicesAndSectors() {
  let created = 0;
  for (const s of services) {
    const svc = await db.service.upsert({
      where: { slug: s.slug },
      create: {
        slug: s.slug, name: s.serviceName, shortName: s.shortName, summary: s.summary, sortOrder: s.sortOrder,
        allowLocationPages: s.allowLocationPages, showInNav: s.showInNav,
      },
      update: { name: s.serviceName, shortName: s.shortName, summary: s.summary, sortOrder: s.sortOrder },
    });
    if (await createPageIfMissing(s, "SERVICE", { serviceId: svc.id })) created++;
  }
  for (const s of sectors) {
    const sec = await db.sector.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, name: s.sectorName, sortOrder: s.sortOrder },
      update: { name: s.sectorName, sortOrder: s.sortOrder },
    });
    if (await createPageIfMissing(s, "SECTOR", { sectorId: sec.id })) created++;
  }
  console.log(`✓ ${services.length} hizmet, ${sectors.length} sektör (${created} yeni sayfa)`);
}

async function seedContentPages() {
  let created = 0;
  if (await createPageIfMissing(homePage, "HOME")) created++;
  for (const p of staticPages) if (await createPageIfMissing(p, p.type, { status: p.status })) created++;
  for (const p of blogPosts) if (await createPageIfMissing(p, "BLOG_POST")) created++;
  console.log(`✓ Ana sayfa, ${staticPages.length} sabit sayfa, ${blogPosts.length} rehber yazısı (${created} yeni)`);
}

/**
 * 81 il ve tüm ilçe sayfaları TASLAK ve İÇERİKSİZ oluşturulur. Ziyaretçiye 404
 * döner, sitemap'e girmez. Editör gerçek yerel içerik girip yayına hazırlık
 * kontrolünden geçtiğinde yayımlanır. Şehir adı değiştirilmiş toplu içerik
 * üretilmez (Google scaled content abuse politikası).
 */
async function seedLocationPages() {
  const root = await db.service.findUniqueOrThrow({ where: { slug: "web-tasarim" } });
  const provinces = await db.province.findMany({ include: { districts: true } });
  const existing = new Set((await db.page.findMany({ select: { path: true } })).map((p) => p.path));
  const sectorSlugs = new Set(sectors.map((s) => s.slug));
  const rows: Prisma.PageCreateManyInput[] = [];
  for (const p of provinces) {
    const cityPath = `/web-tasarim/${p.slug}`;
    if (!existing.has(cityPath))
      rows.push({
        path: cityPath, type: "CITY", status: "DRAFT", name: `${p.name} Web Tasarım`, breadcrumbLabel: p.name,
        h1: `${p.name} Web Tasarım`, primaryKeyword: `web tasarım ${trLower(p.name)}`, serviceId: root.id, provinceId: p.id,
      });
    for (const d of p.districts) {
      if (sectorSlugs.has(d.slug)) throw new Error(`İlçe slug'ı sektörle çakışıyor: ${p.slug}/${d.slug}`);
      const path_ = `/web-tasarim/${p.slug}/${d.slug}`;
      if (existing.has(path_)) continue;
      const display = d.name === "Merkez" ? `${p.name} Merkez` : d.name;
      rows.push({
        path: path_, type: "DISTRICT", status: "DRAFT", name: `${display} Web Tasarım`, breadcrumbLabel: d.name,
        h1: `${display} Web Tasarım`, primaryKeyword: `${trLower(display)} web tasarım`, serviceId: root.id,
        provinceId: p.id, districtId: d.id,
      });
    }
  }
  if (rows.length) await db.page.createMany({ data: rows });
  console.log(`✓ İl/ilçe taslak sayfaları (${rows.length} yeni; tümü TASLAK)`);
}

async function seedKeywords() {
  const bySlug = async (path: string) => (await db.page.findUnique({ where: { path }, select: { id: true } }))?.id ?? null;
  const prov = async (slug: string) => (await db.province.findUnique({ where: { slug } }))?.id ?? null;
  const list: { phrase: string; path: string; intent: "COMMERCIAL" | "TRANSACTIONAL" | "LOCAL" | "INFORMATIONAL"; priority: number; province?: string; district?: [string, string] }[] = [
    { phrase: "web tasarım", path: "/web-tasarim", intent: "COMMERCIAL", priority: 5 },
    { phrase: "web tasarım ajansı", path: "/web-tasarim-ajansi", intent: "COMMERCIAL", priority: 5 },
    { phrase: "web tasarım fiyatları", path: "/web-tasarim-fiyatlari", intent: "COMMERCIAL", priority: 5 },
    { phrase: "web sitesi yaptırma", path: "/web-sitesi-yaptirma", intent: "TRANSACTIONAL", priority: 5 },
    { phrase: "kurumsal web tasarım", path: "/kurumsal-web-tasarim", intent: "COMMERCIAL", priority: 4 },
    { phrase: "e-ticaret sitesi", path: "/e-ticaret-web-tasarim", intent: "COMMERCIAL", priority: 4 },
    { phrase: "seo hizmeti", path: "/seo-hizmeti", intent: "COMMERCIAL", priority: 3 },
    { phrase: "web tasarım nedir", path: "/blog/web-tasarim-nedir", intent: "INFORMATIONAL", priority: 2 },
    { phrase: "web tasarım sakarya", path: "/web-tasarim/sakarya", intent: "LOCAL", priority: 5, province: "sakarya" },
    { phrase: "web tasarım istanbul", path: "/web-tasarim/istanbul", intent: "LOCAL", priority: 4, province: "istanbul" },
    { phrase: "web tasarım ankara", path: "/web-tasarim/ankara", intent: "LOCAL", priority: 4, province: "ankara" },
    { phrase: "web tasarım izmir", path: "/web-tasarim/izmir", intent: "LOCAL", priority: 4, province: "izmir" },
    { phrase: "web tasarım adapazarı", path: "/web-tasarim/sakarya/adapazari", intent: "LOCAL", priority: 4, district: ["sakarya", "adapazari"] },
    { phrase: "web tasarım serdivan", path: "/web-tasarim/sakarya/serdivan", intent: "LOCAL", priority: 3, district: ["sakarya", "serdivan"] },
  ];
  const services_ = await db.service.findMany();
  const rootId = services_.find((s) => s.slug === "web-tasarim")?.id;
  for (const k of list) {
    const provinceId = k.province ? await prov(k.province) : k.district ? await prov(k.district[0]) : null;
    const districtId = k.district && provinceId
      ? (await db.district.findUnique({ where: { provinceId_slug: { provinceId, slug: k.district[1] } } }))?.id ?? null
      : null;
    const normalized = normalizeKeyword(k.phrase);
    await db.keyword.upsert({
      where: { normalized },
      create: {
        phrase: k.phrase, normalized, intent: k.intent, priority: k.priority, targetPageId: await bySlug(k.path),
        provinceId, districtId, serviceId: provinceId ? rootId : null, targetPosition: k.priority >= 5 ? 3 : 10,
      },
      update: {},
    });
  }
  console.log(`✓ ${list.length} anahtar kelime`);
}

async function seedAdmin() {
  if ((await db.user.count()) > 0) return;
  const email = process.env.SEED_ADMIN_EMAIL || "mchttasarim@gmail.com";
  // Kullanıcı adı yalnızca ortamdan (public repoda gerçek yönetici adı yazılmaz)
  const username = process.env.SEED_ADMIN_USERNAME || null;
  // Şifre kaynak koda yazılmaz: SEED_ADMIN_PASSWORD verilmezse rastgele üretilir.
  const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString("base64url") + "7a";
  await db.user.create({ data: { email, username, name: username ?? "Yönetici", role: "ADMIN", passwordHash: await hashPassword(password) } });
  // Şifre ortamdan verildiyse (test/CI) dosyaya yazılmaz; geliştirme şifre dosyası ezilmez.
  if (process.env.SEED_ADMIN_PASSWORD) {
    console.log(`✓ İlk yönetici oluşturuldu: ${email} (şifre ortam değişkeninden)`);
    return;
  }
  const dir = path.join(__dirname, "../.local");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "ilk-yonetici.txt");
  writeFileSync(file, `E-posta: ${email}${username ? `\nKullanıcı adı: ${username}` : ""}\nŞifre: ${password}\n\nİlk girişten sonra şifreyi değiştirin ve bu dosyayı silin.\n`, { mode: 0o600 });
  console.log(`✓ İlk yönetici oluşturuldu: ${email} (şifre: .local/ilk-yonetici.txt)`);
}

// İlk kurulumda gelen iletişim bilgileri (işletme sahibinin verdiği gerçek bilgiler).
// Mevcut ayarların üzerine yazılmaz.
const INITIAL_SETTINGS: Record<string, object> = {
  site: { email: "mchttasarim@gmail.com", whatsapp: "905319729336" },
  business: { phone: "+90 531 972 93 36", email: "mchttasarim@gmail.com" },
};

async function seedSettings() {
  for (const key of ["site", "seo", "business", "integrations", "robots"]) {
    await db.setting.upsert({ where: { key }, create: { key, value: INITIAL_SETTINGS[key] ?? {} }, update: {} });
  }
}

async function main() {
  await seedLocations();
  await seedLocationFacts();
  await seedServicesAndSectors();
  await seedContentPages();
  await seedLocationPages();
  await seedKeywords();
  await seedSettings();
  await seedAdmin();
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
