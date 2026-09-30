// ACİL MÜDAHALE (tek seferlik, elle): production Autopilot'u OBSERVE'e al ve deploy sonrası KESİN Autopilot
// kaynaklı 18 değişikliği uygulamanın KENDİ geri alma fonksiyonuyla (rollbackProposal) geri al.
// Yalnızca .github/workflows/prod-autopilot-rollback.yml tarafından worker container'ında çalıştırılır
// (importlar orada /app/src'ye çevrilir). Sayfa değerleri SQL ile DEĞİL, rollbackProposal → savePage ile
// yazılır: sürüm geçmişi + SEO değişiklik logu oluşur; URL/canonical/robots/status alanlarına dokunulmaz.
// Güvenlik: 18 önerinin tamamı yazmadan ÖNCE doğrulanır; ilk hatada durur; aynı öneri ikinci kez geri
// alınamaz (rollbackProposal yalnızca "applied" durumunu kabul eder).
import { db } from "../../src/lib/db";
import { getSettingsFresh, saveSetting } from "../../src/lib/settings";
import { rollbackProposal } from "../../src/lib/proposals/lifecycle";
import { AUTOPILOT_USER } from "../../src/lib/autopilot/execute";
import { notifyAppRevalidate } from "../../src/lib/jobs/notify";

// Tanılama (prod-diagnostics, çalıştırma 36679829925) ile kesinleşen eşleşmeler: [öneri, sayfa, tür]
const EXPECTED: [string, string, string][] = [
  ["cmunbewho001o0vms35vqvwb9", "/web-tasarim", "TITLE"],
  ["cmunbexmd001q0vmsmbv6i3nz", "/e-ticaret-web-tasarim", "TITLE"],
  ["cmunbez2y001s0vmsgs84wvb1", "/blog/kurumsal-web-sitesi-neden-onemlidir", "TITLE"],
  ["cmunbf1i6001v0vms9gu8inaf", "/google-ads-yonetimi", "CONTENT"],
  ["cmunbf2nf00220vms34qwcgoi", "/blog/web-sitesi-ne-kadar-surede-yapilir", "TITLE"],
  ["cmunbf3nb00240vmsvmo3mjm2", "/seo-hizmeti", "INTERNAL_LINK"],
  ["cmunbf4d600260vms4hvj59ui", "/kvkk-aydinlatma-metni", "KEYWORD"],
  ["cmunbf4eo00290vmswry3xs0f", "/teklif-al", "KEYWORD"],
  ["cmunbf4gz002e0vms2ies953u", "/blog", "KEYWORD"],
  ["cmunbf4ik002h0vms2y2opuv7", "/", "KEYWORD"],
  ["cmunbf4jf002j0vmsskd24ks6", "/dis-klinigi-web-tasarimi", "TITLE"],
  ["cmunbnmex008b0vmsgfmimtdc", "/google-ads-yonetimi", "TITLE"],
  ["cmunbnndk008d0vms3c0pn3tv", "/blog/e-ticaret-sitesi-nasil-kurulur", "TITLE"],
  ["cmunbno45008f0vmszp31rstj", "/insaat-firmasi-web-tasarimi", "TITLE"],
  ["cmunc2kca00gh0vmsfkeiea95", "/kurumsal-web-tasarim", "TITLE"],
  ["cmunc2l1r00gj0vmsv593woy9", "/web-tasarim-fiyatlari", "TITLE"],
  ["cmunc2lx800gl0vmsz45jdl07", "/restoran-web-tasarimi", "TITLE"],
  ["cmunoy8zr00kk0vms1aoouzzs", "/blog/web-sitesi-yaptirirken-nelere-dikkat-edilmeli", "TITLE"],
];
const DRY = process.env.OPS_DRY_RUN === "1";
const BUSY_KINDS = ["autopilot-cycle", "autopilot", "auto-apply-proposals", "content-opportunity-scan", "service-page-opportunity", "local-seo-opportunity", "page-completeness-scan", "competitor-opportunity-scan"];
type Change = { field: string; before: unknown; after: unknown };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function fail(msg: string): never {
  console.log(`DURDU: ${msg}`);
  process.exit(2);
}

async function main() {
  // 0) Öneri üreten/uygulayan bir iş şu an çalışıyorsa hiçbir şey yazma
  const busy = await db.jobRun.findMany({ where: { status: "running", kind: { in: BUSY_KINDS } }, select: { kind: true } });
  if (busy.length) fail(`çalışan iş var: ${busy.map((b) => b.kind).join(", ")}`);

  // 1) Ön kontrol: 18 önerinin tamamı (yazmadan önce)
  const rows = await db.autopilotAction.findMany({ where: { id: { in: EXPECTED.map((e) => e[0]) } }, include: { run: { select: { id: true } } } });
  const pages = new Map((await db.page.findMany({ where: { id: { in: rows.map((r) => r.pageId).filter(Boolean) as string[] } }, select: { id: true, path: true } })).map((p) => [p.id, p.path]));
  for (const [id, path, type] of EXPECTED) {
    const a = rows.find((r) => r.id === id);
    if (!a) fail(`öneri bulunamadı: ${id}`);
    if (a.type !== type) fail(`${id}: tür ${a.type} (beklenen ${type})`);
    if (a.status !== "applied") fail(`${id}: durum ${a.status} (yalnızca "applied" geri alınır)`);
    if (!["auto_48h", "autopilot"].includes(a.appliedVia ?? "")) fail(`${id}: otomatik uygulanmamış (${a.appliedVia})`);
    const pc = (a.proposedChanges as { pages?: { pageId: string; path: string; changes: Change[] }[] } | null)?.pages ?? [];
    if (pc.length !== 1 || pc[0].path !== path) fail(`${id}: değişiklik sayfası ${pc.map((p) => p.path).join(",")} (beklenen ${path})`);
    if (a.pageId && pages.get(a.pageId) !== path && type !== "INTERNAL_LINK") fail(`${id}: sayfa ${pages.get(a.pageId)} (beklenen ${path})`);
    for (const c of pc[0].changes) if (["path", "canonical", "robotsIndex", "robotsFollow", "status", "schemaDisabled"].includes(c.field)) fail(`${id}: yasak alan ${c.field}`);
  }
  console.log(`ön kontrol: 18/18 öneri doğrulandı (applied, otomatik, beklenen sayfa/tür)`);
  if (DRY) { console.log("OPS_DRY_RUN=1: yazma yapılmadı"); return; }

  // 2) Autopilot'u kapat (uygulamanın kendi ayar kaydı; diğer ayarlar korunur)
  const cur = (await getSettingsFresh()).autopilot;
  await saveSetting("autopilot", { ...cur, enabled: false, mode: "OBSERVE", autoApplySafe: false, autoApplyControlled: false, instantApply: false });
  const ap = (await getSettingsFresh()).autopilot;
  if (ap.enabled || ap.mode !== "OBSERVE" || ap.autoApplySafe || ap.autoApplyControlled || ap.instantApply) fail("Autopilot ayarı doğrulanamadı");
  console.log(`AUTOPILOT: kapalı (enabled=${ap.enabled}, mode=${ap.mode}, autoApplySafe=${ap.autoApplySafe}, autoApplyControlled=${ap.autoApplyControlled}, instantApply=${ap.instantApply})`);

  // 3) Geri alma: en yeni önce (/google-ads-yonetimi: title 23:43 → içerik 23:36); ilk hatada dur
  const ordered = [...rows].sort((x, y) => (y.appliedAt?.getTime() ?? 0) - (x.appliedAt?.getTime() ?? 0));
  let ok = 0;
  for (const a of ordered) {
    const set = (a.proposedChanges as { pages: { pageId: string; path: string; changes: Change[] }[] }).pages[0];
    const [vBefore, lBefore] = await Promise.all([
      db.pageVersion.aggregate({ where: { pageId: set.pageId }, _max: { version: true } }),
      db.seoChangeLog.count({ where: { pageId: set.pageId } }),
    ]);
    try {
      await rollbackProposal(AUTOPILOT_USER, a.id);
    } catch (e) {
      fail(`ROLLBACK ${ok}/18 — ${a.id} ${set.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Doğrulama: öneri durumu, yeni sürüm, değişiklik logu, alanlar önceki değerinde (iç link: bağlantı kaldırıldı)
    const [after, vAfter, lAfter, pg] = await Promise.all([
      db.autopilotAction.findUniqueOrThrow({ where: { id: a.id }, select: { status: true } }),
      db.pageVersion.aggregate({ where: { pageId: set.pageId }, _max: { version: true } }),
      db.seoChangeLog.count({ where: { pageId: set.pageId } }),
      db.page.findUniqueOrThrow({ where: { id: set.pageId } }),
    ]);
    if (after.status !== "rolled_back") fail(`${a.id}: durum ${after.status}`);
    if ((vAfter._max.version ?? 0) <= (vBefore._max.version ?? 0)) fail(`${a.id}: yeni sürüm oluşmadı`);
    if (lAfter <= lBefore) fail(`${a.id}: SEO değişiklik logu oluşmadı`);
    for (const c of set.changes) {
      const now = (pg as unknown as Record<string, unknown>)[c.field];
      if (c.field === "relatedLinks") {
        const added = ((c.after as { path: string }[] | null) ?? []).filter((l) => !((c.before as { path: string }[] | null) ?? []).some((b) => b.path === l.path)).map((l) => l.path);
        if (((now as { path: string }[] | null) ?? []).some((l) => added.includes(l.path))) fail(`${a.id}: iç link kaldırılmadı`);
      } else if (!same(now, c.before)) fail(`${a.id}: ${c.field} önceki değerine dönmedi`);
    }
    ok++;
    console.log(`geri alındı ${ok}/18: ${a.type} ${set.path} (${set.changes.map((c) => c.field).join(", ")}) · sürüm ${vBefore._max.version}→${vAfter._max.version}`);
  }
  console.log(`ROLLBACK: ${ok}/18`);
  await notifyAppRevalidate().catch(() => false);

  // 4) Son durum
  const q = await db.jobRun.groupBy({ by: ["status"], where: { status: { in: ["queued", "running"] } }, _count: true });
  console.log(`QUEUE: ${q.map((x) => `${x.status} ${x._count}`).join(", ") || "queued 0, running 0"}`);
  const still = await db.autopilotAction.count({ where: { id: { in: EXPECTED.map((e) => e[0]) }, status: "applied" } });
  console.log(`DOĞRULAMA: ${still === 0 && ok === 18 ? "başarılı" : "başarısız"} (applied kalan ${still})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => fail(e instanceof Error ? e.message : String(e)));
