// Mchttasarım marka ikonlarını tek SVG kaynaktan üretir (harici servis yok).
// Kullanım: node scripts/build-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const INK = "#14161a", PAPER = "#f7f5f0", ACCENT = "#e8531f";
// M monogramı (vektör yol, fonta bağımlı değil) + marka vurgusu olan nokta
const mark = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${rx}" fill="${INK}"/>
<path d="M12 46V19l16 16 16-16v27" fill="none" stroke="${PAPER}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="53.5" cy="45.5" r="4.5" fill="${ACCENT}"/>
</svg>`;

writeFileSync("src/app/icon.svg", mark(14) + "\n");
const png = (size, rx = 14) => sharp(Buffer.from(mark(rx)), { density: Math.max(72, (72 * size) / 64 * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// favicon.ico: PNG gömülü ICO kapsayıcısı (16, 32, 48)
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => png(s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...dir, ...images]));
// Apple dokunmatik ikon: iOS köşeleri kendisi yuvarlar → tam dolu kare
writeFileSync("src/app/apple-icon.png", await png(180, 0));
// Web manifest ikonları (maskable için güvenli alan: kare arka plan)
writeFileSync("public/icons/icon-192.png", await png(192, 0));
writeFileSync("public/icons/icon-512.png", await png(512, 0));
console.log("ikonlar üretildi");
