import "server-only";
// Haftalık SEO raporu: yalnızca Search Console verisi ve sistemin kendi kayıtları.
// Veri yoksa "Henüz gerçek Google verisi alınamadı." yazılır; tahmin/uydurma yok.
// Sonuçlar "gözlenen değişim"dir; nedensellik iddia edilmez.

import { db } from "../db";
import { siteUrl } from "../env";
import { escapeHtml } from "../text/markdown";
import { locationDemand } from "../seo/location-demand";
import { getSettingsFresh } from "../settings";
import { ACTION_LABELS, type ActionType } from "./decide";
import { addDays, lastDataDay, pct } from "./metrics";
import { STATUS_LABELS, overallScore, type HealthCategory, type SeoHealth } from "./health";

export const NO_DATA_TEXT = "Henüz gerçek Google verisi alınamadı.";

type Agg = { impressions: number; clicks: number; ctr: number | null; position: number | null };
export type KwRow = { query: string; prev: number | null; now: number | null; change: number | null; impressions: number; clicks: number; page: string | null };
export type PlanItem = { title: string; type: string; score: number; reason: string };

export type WeeklyReport = {
  generatedAt: string;
  hasData: boolean;
  periods: { current: string; previous: string; kwCurrent: string; kwPrevious: string } | null;
  general: { now: Agg; prev: Agg; clicksPct: number | null; impressionsPct: number | null; ctrPct: number | null } | null;
  important: KwRow[];
  core: (KwRow & { source: string; noData: boolean })[];
  rising: KwRow[];
  falling: KwRow[];
  discovered: { query: string; impressions: number; position: number | null; source: string }[];
  locations: { name: string; impressions: number; clicks: number; position: number | null; path: string; hasPage: boolean }[];
  actions: { total: number; applied: number; needsApproval: number; skipped: number; failed: number; byType: Record<string, number>; keywordsDiscovered: number; indexNow: string | null };
  results: { title: string; path: string; summary: string; outcome: string; final: boolean }[];
  plan: PlanItem[];
  health: SeoHealth | null;
  changes: { title: string; status: string; note: string | null }[];
};

const fmtRange = (a: Date, b: Date) => `${a.toLocaleDateString("tr-TR", { timeZone: "UTC" })} – ${b.toLocaleDateString("tr-TR", { timeZone: "UTC" })}`;

function agg(rows: { impressions: number; clicks: number; position: number }[]): Agg {
  const i = rows.reduce((s, r) => s + r.impressions, 0);
  const c = rows.reduce((s, r) => s + r.clicks, 0);
  return { impressions: i, clicks: c, ctr: i ? c / i : null, position: i ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / i : null };
}

async function queryWindow(from: Date, to: Date) {
  const rows = await db.gscQueryDaily.findMany({ where: { date: { gte: from, lte: to } }, select: { query: true, page: true, impressions: true, clicks: true, position: true } });
  const m = new Map<string, { i: number; c: number; w: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const e = m.get(r.query) ?? { i: 0, c: 0, w: 0, pages: new Map() };
    e.i += r.impressions; e.c += r.clicks; e.w += r.position * r.impressions;
    e.pages.set(r.page, (e.pages.get(r.page) ?? 0) + r.impressions);
    m.set(r.query, e);
  }
  const base = siteUrl();
  return new Map([...m].map(([q, e]) => {
    const top = [...e.pages].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [q, { impressions: e.i, clicks: e.c, position: e.i ? e.w / e.i : null, page: top ? top.replace(base, "") || "/" : null }];
  }));
}

export async function buildWeeklyReport(opts: { runId?: string | null; plan?: PlanItem[]; now?: Date; health?: SeoHealth | null } = {}): Promise<WeeklyReport> {
  const now = opts.now ?? new Date();
  const end = await lastDataDay();
  const run = opts.runId ? await db.autopilotRun.findUnique({ where: { id: opts.runId }, include: { actions: true } }) : null;
  const weekAgo = addDays(now, -7);
  const actionsRows = run?.actions ?? (await db.autopilotAction.findMany({ where: { createdAt: { gte: weekAgo } } }));
  const byType: Record<string, number> = {};
  for (const a of actionsRows.filter((x) => x.status === "applied")) byType[ACTION_LABELS[a.type as ActionType] ?? a.type] = (byType[ACTION_LABELS[a.type as ActionType] ?? a.type] ?? 0) + 1;
  const [keywordsDiscovered, lastIndexNow, evaluated] = await Promise.all([
    db.keyword.count({ where: { source: "discovered", discoveredAt: { gte: weekAgo } } }),
    db.indexNowSubmission.findFirst({ where: { createdAt: { gte: weekAgo } }, orderBy: { createdAt: "desc" } }),
    db.experiment.findMany({ where: { outcome: { not: null }, OR: [{ status: "running" }, { status: "evaluated", evaluatedAt: { gte: addDays(now, -14) } }] }, orderBy: { appliedAt: "desc" }, take: 15, include: { action: { select: { title: true } } } }),
  ]);
  const report: WeeklyReport = {
    generatedAt: now.toISOString(),
    hasData: Boolean(end),
    periods: null, general: null, important: [], core: [], rising: [], falling: [], discovered: [], locations: [],
    actions: {
      total: actionsRows.length,
      applied: actionsRows.filter((a) => a.status === "applied").length,
      needsApproval: actionsRows.filter((a) => a.status === "needs_approval").length,
      skipped: actionsRows.filter((a) => a.status === "skipped").length,
      failed: actionsRows.filter((a) => a.status === "failed").length,
      byType, keywordsDiscovered,
      indexNow: lastIndexNow ? `${lastIndexNow.status} (${lastIndexNow.urls.length} URL) — ${lastIndexNow.message}` : null,
    },
    results: evaluated.filter((e) => e.result).map((e) => {
      const r = e.result as { summary?: string; interim?: boolean };
      return { title: e.action?.title ?? e.type, path: e.pagePath, summary: r.summary ?? "", outcome: e.outcome ?? "", final: !r.interim };
    }),
    plan: opts.plan ?? [],
    health: opts.health ?? null,
    changes: actionsRows.filter((x) => ["applied", "needs_approval", "rolled_back"].includes(x.status)).map((x) => ({ title: x.title, status: x.status, note: x.qualityNotes })),
  };
  if (!end) return report;

  // Genel performans: son 28 gün vs önceki 28 gün (günlük toplamlar)
  const cur = { from: addDays(end, -27), to: end };
  const prev = { from: addDays(end, -55), to: addDays(end, -28) };
  const totals = async (w: { from: Date; to: Date }) => agg(await db.gscDailyTotal.findMany({ where: { date: { gte: w.from, lte: w.to } }, select: { impressions: true, clicks: true, position: true } }));
  const [gNow, gPrev] = await Promise.all([totals(cur), totals(prev)]);
  report.general = { now: gNow, prev: gPrev, clicksPct: pct(gNow.clicks, gPrev.clicks), impressionsPct: pct(gNow.impressions, gPrev.impressions), ctrPct: pct(gNow.ctr, gPrev.ctr) };

  // Anahtar kelimeler: son 7 gün vs önceki 7 gün
  const k7 = { from: addDays(end, -6), to: end };
  const p7 = { from: addDays(end, -13), to: addDays(end, -7) };
  report.periods = { current: fmtRange(cur.from, cur.to), previous: fmtRange(prev.from, prev.to), kwCurrent: fmtRange(k7.from, k7.to), kwPrevious: fmtRange(p7.from, p7.to) };
  const [qNow, qPrev, qOlder] = await Promise.all([queryWindow(k7.from, k7.to), queryWindow(p7.from, p7.to), queryWindow(addDays(end, -41), addDays(end, -7))]);
  const row = (q: string): KwRow => {
    const n = qNow.get(q), p = qPrev.get(q);
    return { query: q, prev: p?.position ?? null, now: n?.position ?? null, change: n?.position != null && p?.position != null ? p.position - n.position : null, impressions: n?.impressions ?? 0, clicks: n?.clicks ?? 0, page: n?.page ?? p?.page ?? null };
  };

  const kws = await db.keyword.findMany({ where: { status: "ACTIVE" }, select: { phrase: true, normalized: true, source: true, clusterId: true, provinceId: true, cluster: { select: { weight: true, kind: true } } } });
  // Sistemin seçtiği en önemli kelimeler: gösterim × iş değeri (küme ağırlığı)
  report.important = kws
    .filter((k) => qNow.has(k.normalized) || qPrev.has(k.normalized))
    .map((k) => ({ r: row(k.normalized), w: (qNow.get(k.normalized)?.impressions ?? 0) * ((k.cluster?.weight ?? 5) / 10) + (qNow.get(k.normalized)?.clicks ?? 0) * 5 }))
    .sort((a, b) => b.w - a.w).slice(0, 15).map((x) => x.r);

  // Türkiye geneli web tasarım kelimeleri: çekirdek + keşfedilen (lokasyonsuz konu kümeleri)
  const seedSet = new Set(kws.filter((k) => k.source === "seed").map((k) => k.normalized));
  const coreKws = kws.filter((k) => seedSet.has(k.normalized) || (k.source === "discovered" && k.cluster?.kind === "TOPIC" && !k.provinceId));
  report.core = coreKws
    .map((k) => ({ ...row(k.normalized), query: k.phrase, source: seedSet.has(k.normalized) ? "çekirdek" : "keşfedilen", noData: !qNow.has(k.normalized) && !qPrev.has(k.normalized) }))
    .sort((a, b) => Number(a.noData) - Number(b.noData) || b.impressions - a.impressions).slice(0, 30);

  const moved = [...new Set([...qNow.keys()].filter((q) => qPrev.has(q)))].map(row).filter((r) => r.change != null && r.impressions >= 5);
  report.rising = moved.filter((r) => r.change! >= 2).sort((a, b) => b.change! - a.change!).slice(0, 10);
  report.falling = moved.filter((r) => r.change! <= -2).sort((a, b) => a.change! - b.change!).slice(0, 10);

  // Yeni keşfedilenler: bu hafta ilk kez görünen sorgular + bu hafta sisteme eklenen kelimeler
  const fresh = [...qNow].filter(([q, v]) => !qOlder.has(q) && v.impressions >= 3).sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 10)
    .map(([q, v]) => ({ query: q, impressions: v.impressions, position: v.position, source: "ilk kez görünen sorgu" }));
  const added = await db.keyword.findMany({ where: { source: "discovered", discoveredAt: { gte: weekAgo } }, select: { phrase: true, normalized: true }, take: 20 });
  const seen = new Set(fresh.map((f) => f.query));
  report.discovered = [...fresh, ...added.filter((k) => !seen.has(k.normalized)).map((k) => ({ query: k.phrase, impressions: qNow.get(k.normalized)?.impressions ?? 0, position: qNow.get(k.normalized)?.position ?? null, source: "sisteme eklendi" }))].slice(0, 20);

  // Lokasyon performansı: yalnızca gerçek Search Console verisi olan konumlar
  const demand = await locationDemand(28);
  report.locations = demand.rows.filter((r) => r.impressions > 0).slice(0, 15)
    .map((r) => ({ name: r.name, impressions: r.impressions, clicks: r.clicks, position: r.position, path: r.path, hasPage: r.verdict === "YAYINDA" || r.verdict === "ZAYIF" }));
  return report;
}

// ─── Biçimlendirme ──────────────────────────────────────────────────────────

const n = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const pos = (v: number | null) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
const ctr = (v: number | null) => (v == null ? "—" : `%${(v * 100).toFixed(2).replace(".", ",")}`);
const sign = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const move = (v: number | null) => (v == null ? "—" : v > 0 ? `↑ ${v.toFixed(1).replace(".", ",")}` : v < 0 ? `↓ ${Math.abs(v).toFixed(1).replace(".", ",")}` : "0");

type Opts = { notifyRising: boolean; notifyFalling: boolean };

function sections(r: WeeklyReport, o: Opts) {
  const kwHead = ["Kelime", "Önceki", "Şimdi", "Değişim", "Gösterim", "Tıklama"];
  const kwRows = (rows: KwRow[], withUrl = false) => rows.map((x) => [x.query, pos(x.prev), pos(x.now), move(x.change), n(x.impressions), n(x.clicks), ...(withUrl ? [x.page ?? "—"] : [])]);
  const out: { title: string; note?: string; head?: string[]; rows?: string[][]; lines?: string[] }[] = [];
  if (!r.hasData || !r.general) {
    out.push({ title: "📊 Genel performans", lines: [NO_DATA_TEXT, "Search Console bağlantısı kurulduğunda bu rapor gerçek tıklama, gösterim, CTR ve pozisyon verisiyle dolacak."] });
  } else {
    const g = r.general;
    out.push({
      title: "📊 Genel performans", note: `Son 28 gün (${r.periods!.current}) ile önceki 28 gün (${r.periods!.previous})`,
      head: ["Ölçü", "Önceki", "Şimdi", "Değişim"],
      rows: [
        ["Organik tıklama", n(g.prev.clicks), n(g.now.clicks), sign(g.clicksPct)],
        ["Gösterim", n(g.prev.impressions), n(g.now.impressions), sign(g.impressionsPct)],
        ["CTR", ctr(g.prev.ctr), ctr(g.now.ctr), sign(g.ctrPct)],
        ["Ortalama pozisyon", pos(g.prev.position), pos(g.now.position), move(g.prev.position != null && g.now.position != null ? g.prev.position - g.now.position : null)],
      ],
    });
  }
  const noData = (title: string) => out.push({ title, lines: [NO_DATA_TEXT] });
  if (r.health) {
    const detail = (c: HealthCategory) => {
      const bad = c.checks.filter((x) => x.status === "FAIL" || x.status === "WARNING");
      const pick = bad.length ? bad : c.checks.filter((x) => x.status === "NOT_VERIFIABLE" && c.status === "NOT_VERIFIABLE");
      return (pick.length ? pick : c.checks).slice(0, 2).map((x) => `${x.label}: ${x.evidence}`).join(" · ");
    };
    const find = (key: string, label: string) => r.health!.categories.find((c) => c.key === key)?.checks.find((x) => x.label === label);
    const line = (name: string, ch: ReturnType<typeof find>) => `${name}: ${ch ? `${STATUS_LABELS[ch.status]} — ${ch.evidence}` : "—"}`;
    out.push({
      title: "🩺 SEO Sağlık Özeti", note: "Her kategori yalnızca ölçülebilen kontrollerden değerlendirilir; NOT VERIFIABLE = veri yok (kötü anlamına gelmez).",
      head: ["Kategori", "Durum", "Skor", "Ayrıntı"],
      rows: r.health.categories.map((c) => [c.label, STATUS_LABELS[c.status], c.score == null ? "—" : String(c.score), detail(c)]),
      lines: [
        (() => { const o = overallScore(r.health!); return `Genel SEO sağlık skoru: ${o.score ?? "—"}/100${o.deductions.length ? ` — düşüşler: ${o.deductions.map((d) => `${d.label} −${String(d.points).replace(".", ",")}`).join(", ")}` : ""}${o.notVerifiable.length ? ` · ${o.notVerifiable.length} kontrol veri olmadığı için skora katılmadı` : ""}`; })(),
        line("Favicon", find("technical", "Favicon")),
        line("Sitemap", find("indexability", "Sitemap")),
        line("robots.txt", find("indexability", "robots.txt erişimi") ?? find("indexability", "robots.txt")),
        line("Yapılandırılmış veri", find("structured", "Schema hataları")),
        line("Core Web Vitals", find("performance", "Core Web Vitals (LCP, INP, CLS)")),
        line("AI görünürlüğü", find("ai", "AI arama botları")),
        line("Bing / IndexNow", find("bing", "IndexNow")),
        line("Search Console", find("google", "Search Console") ?? find("google", "Organik tıklama trendi")),
      ],
    });
  }
  const kwNote = r.periods ? `Son 7 gün (${r.periods.kwCurrent}) ile önceki 7 gün; pozisyon Search Console ortalamasıdır` : undefined;
  if (!r.hasData) noData("🔑 En önemli anahtar kelimeler");
  else out.push({ title: "🔑 En önemli anahtar kelimeler", note: `Sistem seçti: gösterim × iş değeri. ${kwNote}`, head: kwHead, rows: r.important.length ? kwRows(r.important) : undefined, lines: r.important.length ? undefined : ["Takip edilen kelimelerde bu dönemde gösterim yok."] });
  if (!r.hasData) noData("🇹🇷 Türkiye geneli web tasarım kelimeleri");
  else out.push({ title: "🇹🇷 Türkiye geneli web tasarım kelimeleri", note: "Çekirdek liste + sistemin keşfettiği kelimeler. “VERİ YOK”: Google bu kelimede siteyi göstermedi.", head: [...kwHead, "Kaynak"],
    rows: r.core.map((x) => x.noData ? [x.query, "VERİ YOK", "VERİ YOK", "—", "—", "—", x.source] : [...kwRows([x])[0], x.source]) });
  if (o.notifyRising) {
    if (!r.hasData) noData("🚀 Yükselenler");
    else out.push({ title: "🚀 Yükselenler", note: "En az 2 sıra iyileşen, en az 5 gösterimli sorgular", head: kwHead, rows: r.rising.length ? kwRows(r.rising) : undefined, lines: r.rising.length ? undefined : ["Bu hafta belirgin yükselen sorgu yok."] });
  }
  if (o.notifyFalling) {
    if (!r.hasData) noData("🔻 Düşenler");
    else out.push({ title: "🔻 Düşenler", note: "En az 2 sıra gerileyen sorgular ve ilgili URL", head: [...kwHead, "URL"], rows: r.falling.length ? kwRows(r.falling, true) : undefined, lines: r.falling.length ? undefined : ["Bu hafta belirgin düşen sorgu yok."] });
  }
  if (!r.hasData) noData("🆕 Yeni keşfedilen kelimeler");
  else out.push({ title: "🆕 Yeni keşfedilen kelimeler", head: ["Kelime", "Gösterim (7 gün)", "Pozisyon", "Kaynak"], rows: r.discovered.length ? r.discovered.map((d) => [d.query, n(d.impressions), pos(d.position), d.source]) : undefined, lines: r.discovered.length ? undefined : ["Bu hafta yeni sorgu keşfedilmedi."] });
  if (!r.hasData) noData("📍 Lokasyon performansı");
  else out.push({ title: "📍 Lokasyon performansı", note: "Yalnızca Search Console'da gerçek gösterimi olan konumlar (son 28 gün)", head: ["Konum", "Gösterim", "Tıklama", "Pozisyon", "Sayfa"],
    rows: r.locations.length ? r.locations.map((l) => [l.name, n(l.impressions), n(l.clicks), pos(l.position), l.hasPage ? l.path : "sayfa yok / yayında değil"]) : undefined, lines: r.locations.length ? undefined : ["Konum içeren sorguda gösterim yok."] });
  const a = r.actions;
  out.push({ title: "🤖 Sistem bu hafta ne yaptı?", lines: [
    `Seçilen işlem: ${a.total} · uygulanan: ${a.applied} · onay bekleyen: ${a.needsApproval} · kalite kapısında elenen/atlanan: ${a.skipped} · hata: ${a.failed}`,
    ...Object.entries(a.byType).map(([k, v]) => `${k}: ${v}`),
    `Keşfedilen yeni kelime: ${a.keywordsDiscovered}`,
    `IndexNow: ${a.indexNow ?? "bu hafta gönderim yok"}`,
  ] });
  const applied = r.changes.filter((c) => c.status === "applied"), pending = r.changes.filter((c) => c.status === "needs_approval");
  out.push({ title: "🛠️ Yapılan değişiklikler ve onay bekleyenler", lines: [
    ...(applied.length ? applied.map((c) => `✓ ${c.title}${c.note ? ` — ${c.note}` : ""}`) : ["Bu hafta otomatik değişiklik uygulanmadı."]),
    ...pending.map((c) => `⏳ Onay bekliyor: ${c.title}${c.note ? ` — ${c.note}` : ""}`),
    ...r.changes.filter((c) => c.status === "rolled_back").map((c) => `↩ Geri alındı: ${c.title}`),
  ] });
  out.push({ title: "🧪 Önceki değişikliklerin sonucu", note: "Gözlenen değişim; değişikliğin tek nedeni olduğu iddia edilmez (mevsimsellik, Google güncellemeleri vb. etkiler).",
    head: r.results.length ? ["İşlem", "Sayfa", "Gözlenen değişim", "Durum"] : undefined,
    rows: r.results.length ? r.results.map((x) => [x.title, x.path, x.summary, x.final ? "nihai" : "ara ölçüm"]) : undefined,
    lines: r.results.length ? undefined : ["Henüz ölçülebilecek kadar süre geçmiş değişiklik yok (ilk ölçüm uygulamadan 7 gün sonra)."] });
  out.push({ title: "🎯 Gelecek hafta planı", note: "Sistem seçti (fırsat skoru sırasıyla)", lines: r.plan.length ? r.plan.map((p, i) => `${i + 1}. ${p.title} — skor ${p.score}. ${p.reason}`) : ["Plan için yeterli fırsat bulunamadı."] });
  return out;
}

export function renderReportText(r: WeeklyReport, o: Opts): string {
  const lines = ["HAFTALIK SEO RAPORU", `Oluşturulma: ${new Date(r.generatedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`, ""];
  for (const s of sections(r, o)) {
    lines.push(s.title.toLocaleUpperCase("tr-TR"));
    if (s.note) lines.push(`(${s.note})`);
    if (s.head && s.rows) {
      lines.push(s.head.join(" | "));
      for (const row of s.rows) lines.push(row.join(" | "));
    }
    for (const l of s.lines ?? []) lines.push(l);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderReportHtml(r: WeeklyReport, o: Opts, adminUrl: string): string {
  const e = escapeHtml;
  const td = "padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left;vertical-align:top";
  const body = sections(r, o).map((s) => `
    <h2 style="font-size:17px;margin:28px 0 6px;color:#111827">${e(s.title)}</h2>
    ${s.note ? `<p style="margin:0 0 8px;color:#6b7280;font-size:12px">${e(s.note)}</p>` : ""}
    ${s.head && s.rows ? `<table style="border-collapse:collapse;width:100%"><thead><tr>${s.head.map((h) => `<th style="${td};background:#f3f4f6;font-weight:600">${e(h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map((row) => `<tr>${row.map((c) => `<td style="${td}">${e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}
    ${(s.lines ?? []).map((l) => `<p style="margin:4px 0;font-size:14px;color:#1f2937">${e(l)}</p>`).join("")}`).join("");
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:760px;margin:0 auto;background:#fff;padding:24px">
    <h1 style="font-size:22px;margin:0 0 4px;color:#111827">Haftalık SEO Raporu</h1>
    <p style="margin:0;color:#6b7280;font-size:13px">${e(new Date(r.generatedAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }))} · Kaynak: Google Search Console ve sistem kayıtları</p>
    ${body}
    <p style="margin:28px 0 0;font-size:13px"><a href="${e(adminUrl)}" style="color:#0f6e46">Otopilot panelini aç</a> — onay bekleyen işlemleri ve geri alma seçeneklerini buradan yönetebilirsiniz.</p>
  </div></body></html>`;
}

export async function weeklySubject(r: WeeklyReport): Promise<string> {
  const { site } = await getSettingsFresh();
  const g = r.general;
  const tail = g ? ` · tıklama ${sign(g.clicksPct)}, gösterim ${sign(g.impressionsPct)}` : " · Google verisi yok";
  return `Haftalık SEO Raporu — ${site.siteName}${tail}`;
}
