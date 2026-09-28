import "server-only";
// ÖNERİ YAŞAM DÖNGÜSÜ (48 saatlik onay).
//
//   oluştur → HAZIRLA (somut değişiklik + kalite kapısı; sayfaya yazılmaz)
//     → pending_approval (expiresAt = şimdi + pencere)
//         ├─ kullanıcı onaylar ........ → uygulama hattı (hemen)
//         ├─ kullanıcı reddeder ....... → rejected (uygulanmaz)
//         └─ süre dolar + autoApply ... → zamanlayıcı → worker → uygulama hattı
//   uygulama hattı: doğrulama → anlık görüntü → uygula → DB testi → SEO doğrulama →
//     tarama kontrolü → geri alma noktası. Uygulamadan sonraki bir adım başarısızsa
//     sayfa otomatik eski hâline döner; otomatik denemede geçici hata yeniden denenir.
//
// Sessiz başarı yok: "applied" yalnızca veritabanından tekrar okunan değer yeni değere
// eşitse yazılır. Her adım `validation` alanına ve denetim loguna düşer.

import { db } from "../db";
import type { SessionUser } from "../auth/session";
import { diffFields, pageInputSchema, refreshPublic, savePage, snapshotOf, type PageInput } from "../admin/pages";
import { parseFaq, PLACEHOLDER_RE, UNVERIFIED_RE } from "../seo/analyzer-shared";
import { analyzeAndStore, analyzeUnsaved, loadSiteState } from "../seo/analyzer";
import { resolveTitle } from "../seo/meta";
import { fetchFollow } from "../crawler/crawl";
import { notifyAppRevalidate } from "../jobs/notify";
import { AUTOPILOT_USER, prepareAction, rollbackAction, type ExecOutcome, type FieldChange, type ProposedChanges } from "../autopilot/execute";
import { newPageGate, publishNewPage, rollbackNewPage } from "../autopilot/new-page";
import { startExperiment } from "../autopilot/experiments";
import { getSettingsFresh } from "../settings";
import { siteUrl } from "../env";
import { extractMarkdown } from "../text/markdown";
import { wordCount } from "../text/analyze";
import { unsafeMarkup } from "../content/sanitize";
import { AUTO_APPLY_TYPES, FORBIDDEN_FIELDS, STATUS_CHANGE_TYPES, autoApplyBlocker, expiryFor, fingerprintOf, hasChanges, riskLevelFor, type Category } from "./policy";

/** Test edilebilir saat: testler `clock.now`'u değiştirerek 48 saati simüle eder. */
export const clock = { now: () => new Date() };

export const MAX_AUTO_ATTEMPTS = 3;
export const RETRY_BASE_MS = 15 * 60_000; // 15 dk, 30 dk
const LEASE_MS = 30 * 60_000; // "applying" durumunda kalan işin kurtarılma süresi

type Row = Awaited<ReturnType<typeof db.autopilotAction.findUniqueOrThrow>>;
type Step = { step: string; status: "ok" | "fail" | "not_verifiable" | "skipped"; note: string; at: string };
export type Via = "manual" | "auto_48h" | "autopilot";
export const VIA_LABELS: Record<Via, string> = { manual: "elle onay", auto_48h: "onay süresi doldu — otomatik", autopilot: "otopilot (pencere 0)" };

// ─── Oluşturma ───────────────────────────────────────────────────────────────

export type NewProposal = {
  key: string; // anlamsal anahtar (ör. "TITLE:<pageId>"); mükerrer önleme bunun üzerinden
  type: string;
  risk: "AUTO" | "CONTROLLED" | "HUMAN";
  category?: Category;
  source?: string;
  title: string;
  reason: string;
  score: number;
  runId?: string | null;
  pageId?: string | null;
  query?: string | null;
  clusterId?: string | null;
  proposal?: Record<string, unknown>;
  expectedImpact?: string | null;
  allowAuto: boolean; // mod/bütçe/ayar otomatik uygulamaya izin veriyor mu
  noAutoReason?: string | null; // allowAuto=false ise gerçek neden (ASSIST modu, bütçe doldu vb.)
};

export type CreateResult = { id: string | null; status: string; note: string; duplicate?: boolean };

const CATEGORY_OF: Record<string, Category> = { CONTENT: "CONTENT", NEW_PAGE: "CONTENT", LOCATION: "LOCAL", TECH: "TECH", BROKEN_LINK: "TECH" };

/** Aynı öneri bekliyor / yakında uygulandı / reddedildi / art arda başarısız oldu mu? */
export async function duplicateReason(key: string, now = clock.now()): Promise<{ id: string; note: string } | null> {
  const rows = await db.autopilotAction.findMany({
    where: { OR: [{ fingerprint: key }, { fingerprint: { startsWith: `${key}#` } }], createdAt: { gte: new Date(now.getTime() - 30 * 86400_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, appliedAt: true, rejectedAt: true },
  });
  const open = rows.find((r) => ["preparing", "pending_approval", "applying", "needs_approval"].includes(r.status) || (r.status === "blocked" && r.createdAt.getTime() > now.getTime() - 7 * 86400_000));
  if (open) return { id: open.id, note: "Aynı öneri zaten açık" };
  const rejected = rows.find((r) => r.status === "rejected");
  if (rejected) return { id: rejected.id, note: "Aynı öneri son 30 gün içinde reddedildi" };
  const applied = rows.find((r) => r.status === "applied" && r.appliedAt && r.appliedAt.getTime() > now.getTime() - 14 * 86400_000);
  if (applied) return { id: applied.id, note: "Aynı öneri son 14 gün içinde uygulandı" };
  // Uygulanabilir değişiklik üretmeyen (atlanan) öneri her taramada yeniden denenmez
  const skipped = rows.find((r) => r.status === "skipped" && r.createdAt.getTime() > now.getTime() - 7 * 86400_000);
  if (skipped) return { id: skipped.id, note: "Aynı öneri son 7 günde uygulanabilir bir değişiklik üretmedi" };
  const failed = rows.filter((r) => r.status === "failed" && r.createdAt.getTime() > now.getTime() - 14 * 86400_000);
  if (failed.length >= 2) return { id: failed[0].id, note: "Aynı öneri 14 gün içinde 2 kez başarısız oldu (soğuma)" };
  return null;
}

/** Öneriyi oluşturur ve hemen hazırlar; sonuç: pending_approval | blocked | needs_approval | skipped | failed. */
export async function createProposal(p: NewProposal, opts: { model: string; windowHours: number }): Promise<CreateResult> {
  const now = clock.now();
  const dup = await duplicateReason(p.key, now);
  if (dup) return { id: dup.id, status: "duplicate", note: dup.note, duplicate: true };
  const row = await db.autopilotAction.create({
    data: {
      runId: p.runId ?? null, type: p.type, risk: p.risk, status: "preparing", score: p.score, title: p.title, reason: p.reason,
      pageId: p.pageId ?? null, query: p.query ?? null, clusterId: p.clusterId ?? null, proposal: (p.proposal ?? {}) as object,
      category: p.category ?? CATEGORY_OF[p.type] ?? "SEO", source: p.source ?? "autopilot", expectedImpact: p.expectedImpact ?? null,
      fingerprint: p.key, riskLevel: riskLevelFor(p.risk, null, p.type), createdAt: now,
    },
  });
  const r = await prepareAction(row.id, { model: opts.model });
  return finalizePrepared(row.id, p, r, opts.windowHours, now);
}

async function finalizePrepared(id: string, p: NewProposal, r: ExecOutcome, windowHours: number, now: Date): Promise<CreateResult> {
  if (r.status === "prepared" && hasChanges(r.changes)) {
    const changes = r.changes!;
    const fingerprint = fingerprintOf(p.key, changes);
    const riskLevel = riskLevelFor(p.risk, changes, p.type);
    const blocker = autoApplyBlocker({ type: p.type, riskLevel, proposedChanges: changes });
    const autoApply = p.allowAuto && !blocker && !r.noAuto;
    const pages = await db.page.findMany({ where: { id: { in: changes.pages.map((x) => x.pageId) } } });
    const beforeSnapshot = { pages: pages.map((pg) => ({ pageId: pg.id, path: pg.path, snapshot: snapshotOf(pg as unknown as Record<string, unknown>) })) };
    const why = !p.allowAuto ? p.noAutoReason ?? "Mod/ayar/haftalık bütçe otomatik uygulamaya izin vermiyor" : blocker ?? r.noAuto ?? null;
    await db.autopilotAction.update({
      where: { id },
      data: {
        status: "pending_approval", proposedChanges: changes as object, beforeSnapshot: beforeSnapshot as object, fingerprint, riskLevel, autoApply,
        expiresAt: expiryFor(now, windowHours), qualityNotes: [r.note, autoApply ? null : `Otomatik uygulanmaz: ${why}`].filter(Boolean).join(" · "),
      },
    });
    await db.auditLog.create({ data: { action: "proposal.create", entity: "autopilotAction", entityId: id, detail: { type: p.type, autoApply, riskLevel, expiresAt: expiryFor(now, windowHours).toISOString() } } });
    return { id, status: "pending_approval", note: r.note };
  }
  // Uygulanabilir değişiklik üretilemedi: gerçek neden gösterilir, düğme/geri sayım yok
  const status = r.status === "skipped" ? "skipped" : r.status === "failed" ? "failed" : AUTO_APPLY_TYPES.has(p.type) ? "blocked" : "needs_approval";
  await db.autopilotAction.update({ where: { id }, data: { status, qualityNotes: r.note, ...(status === "failed" ? { error: r.note } : {}), riskLevel: riskLevelFor(p.risk, null, p.type) } });
  return { id, status, note: r.note };
}

// ─── Uygulama hattı ──────────────────────────────────────────────────────────

type PageQuality = { score: number; schemaErrors: number; noindex: boolean; similar: number; similarPath: string | null; stuffing: string; length: string; words: number };

function qualityOf(an: NonNullable<Awaited<ReturnType<typeof analyzeUnsaved>>>, noindex: boolean): PageQuality {
  const check = (id: string) => an.seo.checks.find((c) => c.id === id)?.status ?? "NA";
  return { score: an.seo.score, schemaErrors: an.schemaIssues.filter((i) => i.level === "error").length, noindex, similar: an.similar.score, similarPath: an.similar.path, stuffing: check("stuffing"), length: check("length"), words: an.seo.wordCount };
}

class PipelineError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export type ApplyResult = { ok: boolean; status: string; note: string; changedPaths?: string[] };

type Link = { path: string; anchor: string; reason?: string };

/** İç link listesinde birleştirme: öneriden sonra eklenen başka linkler korunur. */
function mergeLinks(current: unknown, before: unknown, after: unknown): Link[] | null {
  const cur = (current as Link[] | null) ?? [];
  const b = (before as Link[] | null) ?? [];
  const a = (after as Link[] | null) ?? [];
  const added = a.filter((l) => !b.some((x) => x.path === l.path));
  const removed = b.filter((l) => !a.some((x) => x.path === l.path)).map((l) => l.path);
  const out = [...cur.filter((l) => !removed.includes(l.path)), ...added.filter((l) => !cur.some((x) => x.path === l.path))];
  return out.length ? out : null;
}

async function inputWith(pageId: string, patch: Partial<PageInput>): Promise<PageInput> {
  const p = await db.page.findUniqueOrThrow({ where: { id: pageId } });
  const cur = snapshotOf(p as unknown as Record<string, unknown>);
  return pageInputSchema.parse({ ...cur, faq: parseFaq(cur.faq), ...patch });
}

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Otomatik uygulamada tarama kontrolü için adres (worker konteynerinde web servisi). */
function internalBase() {
  return process.env.APP_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3300}`;
}

export async function applyProposal(id: string, opts: { via: Via; user?: SessionUser; fetchImpl?: typeof fetch | null; now?: Date }): Promise<ApplyResult> {
  const now = opts.now ?? clock.now();
  const user = opts.user ?? AUTOPILOT_USER;
  // 1) Sahiplenme (idempotency): yalnızca bir süreç "applying"e alabilir
  const claim = await db.autopilotAction.updateMany({
    where: {
      id, status: "pending_approval",
      ...(opts.via === "auto_48h" ? { autoApply: true, expiresAt: { lte: now }, riskLevel: { in: ["LOW", "MEDIUM"] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] } : {}),
    },
    data: { status: "applying", attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count !== 1) {
    const cur = await db.autopilotAction.findUnique({ where: { id }, select: { status: true } });
    return { ok: false, status: "skipped", note: `Öneri uygulanabilir durumda değil (durum: ${cur?.status ?? "yok"})` };
  }
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  const log: Step[] = [];
  const step = (s: string, status: Step["status"], note: string) => log.push({ step: s, status, note, at: new Date().toISOString() });
  const changes = a.proposedChanges as ProposedChanges | null;
  const before: { pageId: string; path: string; snapshot: Record<string, unknown> }[] = [];
  let mutated = false;
  const expected = new Map<string, unknown>();
  try {
    // 2) Doğrulama
    if (!hasChanges(changes)) throw new PipelineError("Uygulanacak somut değişiklik yok", false);
    if (opts.via === "auto_48h") {
      const b = autoApplyBlocker(a);
      if (b) throw new PipelineError(`Otomatik uygulama engellendi: ${b}`, false);
    }
    const all = changes.pages.flatMap((p) => p.changes);
    const forbidden = all.find((c) => FORBIDDEN_FIELDS.has(c.field));
    if (forbidden) throw new PipelineError(`“${forbidden.field}” alanı bu hattan değiştirilemez; sayfa editöründen yapılır`, false);
    // Taslak güvenliği: yayın durumunu yalnızca yeni sayfa önerisi (taslak → yayın) değiştirebilir;
    // diğer hiçbir öneri (eksik alan, içerik, rakip…) elle onayla bile sayfayı yayına alamaz
    if (!STATUS_CHANGE_TYPES.has(a.type) && all.some((c) => c.field === "status")) throw new PipelineError("Bu öneri türü sayfanın yayın durumunu değiştiremez", false);
    for (const c of all) {
      const t = typeof c.after === "string" ? c.after : JSON.stringify(c.after ?? "");
      if (UNVERIFIED_RE.test(t)) throw new PipelineError(`“${c.field}” doğrulanmamış bilgi ([DOĞRULANMALI]) içeriyor`, false);
      if (PLACEHOLDER_RE.test(t)) throw new PipelineError(`“${c.field}” yer tutucu metin içeriyor`, false);
      const unsafe = unsafeMarkup(t);
      if (unsafe.length && c.field !== "relatedLinks") throw new PipelineError(`“${c.field}” güvenli olmayan içerik barındırıyor (${unsafe.join(", ")})`, false);
      // Mevcut içerik silinip yerine kontrolsüz metin konamaz: gövde en çok %10 kısalabilir
      if (c.field === "body" && typeof c.before === "string" && c.before.trim()) {
        const b = wordCount(c.before), n = wordCount(typeof c.after === "string" ? c.after : "");
        if (n < b * 0.9) throw new PipelineError(`Gövde ${b} → ${n} kelimeye kısalıyor; mevcut içerik silinemez`, false);
      }
    }
    for (const set of changes.pages) {
      const pg = await db.page.findUnique({ where: { id: set.pageId } });
      if (!pg) throw new PipelineError(`Sayfa bulunamadı: ${set.path}`, false);
      const cur = snapshotOf(pg as unknown as Record<string, unknown>);
      for (const c of set.changes) {
        if (c.field === "relatedLinks") continue; // birleştirilerek uygulanır
        if (diffFields({ [c.field]: cur[c.field] ?? null }, { [c.field]: c.before ?? null }).length) {
          throw new PipelineError(`Sayfa öneri hazırlandıktan sonra değişti (${set.path}, alan: ${c.field}); öneri geçersiz, bir sonraki döngüde yeniden hazırlanır`, false);
        }
      }
    }
    step("validation", "ok", `${all.length} alan değişikliği doğrulandı (tür, risk, yasak alan, doğrulanmamış bilgi, eskime)`);

    // 3) Anlık görüntü (geri alma noktası)
    const pre = new Map<string, PageQuality>();
    for (const set of changes.pages) {
      const pg = await db.page.findUniqueOrThrow({ where: { id: set.pageId } });
      before.push({ pageId: pg.id, path: pg.path, snapshot: snapshotOf(pg as unknown as Record<string, unknown>) });
      const an = await analyzeUnsaved(pg.id, {});
      if (an) pre.set(pg.id, qualityOf(an, pg.autoNoindex));
    }
    const versionBefore = await db.pageVersion.findFirst({ where: { pageId: changes.pages[0].pageId }, orderBy: { version: "desc" }, select: { id: true } });
    step("snapshot", "ok", `${before.length} sayfanın tam anlık görüntüsü alındı`);

    // 4) Uygula
    const changedPaths: string[] = [];
    if (a.type === "NEW_PAGE") {
      const prop = a.proposal as { pageId?: string; parentPath?: string | null; group?: Parameters<typeof newPageGate>[1] };
      const pageId = changes.pages[0].pageId;
      if (prop.group) {
        const gate = await newPageGate(pageId, prop.group);
        if (!gate.ok) throw new PipelineError(`Kalite kapısı geçmedi: ${gate.checks.filter((c) => c.status === "FAIL").map((c) => c.label).join(", ")}`, false);
      }
      mutated = true;
      const r = await publishNewPage(a, pageId, prop.parentPath ?? null);
      if (r.status !== "applied") throw new PipelineError(r.note, false);
      changedPaths.push(...(r.changedPaths ?? []));
    } else {
      for (const set of changes.pages) {
        const pg = await db.page.findUniqueOrThrow({ where: { id: set.pageId } });
        const patch: Record<string, unknown> = {};
        for (const c of set.changes) patch[c.field] = c.field === "relatedLinks" ? mergeLinks(pg.relatedLinks, c.before, c.after) : c.after;
        const input = await inputWith(set.pageId, patch as Partial<PageInput>);
        // Test adımı, savePage'e giden normalize değerle karşılaştırır (ör. kırpılmış metin)
        for (const c of set.changes) expected.set(`${set.pageId}:${c.field}`, input[c.field as keyof PageInput]);
        mutated = true;
        // Kayıt otopilot adına: onaylanan öneri "elle düzenleme" sayılmaz (30 günlük koruma tetiklenmez);
        // onaylayan kişi sürüm notunda ve decidedBy alanında
        const who = opts.via === "manual" ? `, onaylayan: ${user.name}` : "";
        const r = await savePage(AUTOPILOT_USER, set.pageId, input, `Öneri uygulandı (${VIA_LABELS[opts.via]}${who}): ${a.title}`.slice(0, 300));
        if (!r.ok) throw new PipelineError(r.error, false);
        if (!r.changed.length) throw new PipelineError("Değişiklik oluşmadı (değerler zaten aynı)", false);
        changedPaths.push(set.path);
      }
    }
    step("apply", "ok", `Uygulandı: ${changedPaths.join(", ")}`);

    // 5) Test: veritabanından tekrar oku, her alan yeni değere eşit mi?
    for (const set of changes.pages) {
      const cur = snapshotOf((await db.page.findUniqueOrThrow({ where: { id: set.pageId } })) as unknown as Record<string, unknown>);
      for (const c of set.changes) {
        const want = expected.has(`${set.pageId}:${c.field}`) ? expected.get(`${set.pageId}:${c.field}`) : c.after;
        const ok = c.field === "relatedLinks"
          ? ((c.after as Link[] | null) ?? []).every((l) => ((cur.relatedLinks as Link[] | null) ?? []).some((x) => x.path === l.path))
          : !diffFields({ [c.field]: cur[c.field] ?? null }, { [c.field]: want ?? null }).length;
        if (!ok) throw new PipelineError(`Doğrulama: ${set.path} “${c.field}” veritabanında beklenen değerde değil`, true);
      }
    }
    step("test", "ok", "Veritabanındaki değerler öneriyle birebir aynı");

    // 6) SEO doğrulama: schema, skor, NOINDEX, kopya içerik, keyword stuffing, thin content
    const threshold = (await getSettingsFresh()).seo.duplicateThreshold;
    for (const set of changes.pages) {
      const an = await analyzeAndStore(set.pageId);
      const p0 = pre.get(set.pageId);
      if (!an || !p0) continue;
      const pg = await db.page.findUniqueOrThrow({ where: { id: set.pageId }, select: { autoNoindex: true, status: true } });
      const q = qualityOf(an, pg.autoNoindex);
      const problems = [
        q.schemaErrors > p0.schemaErrors && `yeni schema hatası (${q.schemaErrors - p0.schemaErrors})`,
        q.score < p0.score - 10 && `SEO skoru ${p0.score} → ${q.score} düştü`,
        pg.status === "PUBLISHED" && q.noindex && !p0.noindex && "otomatik NOINDEX'e düştü",
        q.similar >= threshold && p0.similar < threshold && `kopya içerik: ${q.similarPath} ile %${Math.round(q.similar * 100)} benzer`,
        // Yoğunluk yalnızca yeterli uzunlukta anlamlı (5 kelimelik sayfada 4 kelimelik ifade her zaman "yoğun" görünür)
        q.stuffing === "FAIL" && p0.stuffing !== "FAIL" && q.words >= 150 && "keyword stuffing (ana kelime yoğunluğu %3,5'in üzerinde)",
        q.length === "FAIL" && p0.length !== "FAIL" && "thin content",
      ].filter(Boolean);
      if (problems.length) throw new PipelineError(`SEO doğrulama: ${set.path} — ${problems.join("; ")}`, false);
    }
    step("seo", "ok", "Schema hatası artmadı, skor düşmedi, indekslenebilir; kopya/stuffing/thin content yok");

    // 7) Tarama kontrolü: yayındaki sayfa 200 dönüyor ve yeni değer HTML'de
    refreshPublic(changedPaths);
    const f = opts.fetchImpl === undefined ? (process.env.VITEST ? null : fetch) : opts.fetchImpl;
    if (f === fetch) await notifyAppRevalidate();
    step("crawl", ...(await crawlCheck(changes, f)));

    // 8) Geri alma noktası + kayıt
    const versionAfter = await db.pageVersion.findFirst({ where: { pageId: changes.pages[0].pageId }, orderBy: { version: "desc" }, select: { id: true } });
    const afterPages = await db.page.findMany({ where: { id: { in: changes.pages.map((x) => x.pageId) } } });
    const single = changes.pages.length === 1 && changes.pages[0].changes.length === 1 ? changes.pages[0].changes[0] : null;
    step("rollback_point", "ok", "Geri alma noktası kaydedildi (önceki sürüm + alan değerleri)");
    await db.autopilotAction.update({
      where: { id },
      data: {
        status: "applied", appliedAt: now, appliedVia: opts.via, decidedBy: user.name, rollbackAvailable: true, error: null, nextAttemptAt: null,
        beforeSnapshot: { pages: before } as object,
        afterSnapshot: { pages: afterPages.map((pg) => ({ pageId: pg.id, path: pg.path, snapshot: snapshotOf(pg as unknown as Record<string, unknown>) })) } as object,
        validation: log as object,
        ...(a.type !== "NEW_PAGE" ? { versionBeforeId: versionBefore?.id ?? null, versionAfterId: versionAfter?.id ?? null } : {}),
        ...(single && a.type !== "NEW_PAGE" ? { before: { field: single.field, value: single.before ?? null } as object, after: { field: single.field, value: single.after ?? null } as object } : {}),
      },
    });
    const generation = (a.proposal as { generation?: unknown } | null)?.generation ?? null;
    await db.auditLog.create({
      data: {
        userId: opts.via === "manual" && user.id !== AUTOPILOT_USER.id ? user.id : null, action: opts.via === "auto_48h" ? "proposal.auto_apply" : "proposal.apply", entity: "autopilotAction", entityId: id,
        detail: { proposalId: id, via: opts.via, type: a.type, paths: changedPaths, generation, versionBeforeId: versionBefore?.id ?? null, versionAfterId: versionAfter?.id ?? null, validation: log.map((s) => `${s.step}:${s.status}`) } as object,
      },
    });
    // Deney: etkisi ölçülecek sayfa (iç linkte hedef sayfa)
    if (a.type !== "NEW_PAGE" && a.type !== "BROKEN_LINK") {
      const target = a.type === "INTERNAL_LINK" ? String(((a.proposal as { payload?: { target?: string } }).payload ?? {}).target ?? "") : null;
      const measured = target ? await db.page.findUnique({ where: { path: target } }) : a.pageId ? await db.page.findUnique({ where: { id: a.pageId } }) : null;
      if (measured && !(await db.experiment.findUnique({ where: { actionId: id } }))) {
        await startExperiment({ actionId: id, pageId: measured.id, pagePath: measured.path, type: a.type, query: a.query, appliedAt: now });
      }
    }
    return { ok: true, status: "applied", note: `Uygulandı: ${changedPaths.join(", ")}`, changedPaths };
  } catch (e) {
    const err = e instanceof PipelineError ? e : new PipelineError(e instanceof Error ? e.message : String(e), true);
    step("error", "fail", err.message);
    if (mutated) {
      try {
        await revert(a, before, AUTOPILOT_USER);
        step("auto_rollback", "ok", "Sayfa uygulama öncesi hâline döndürüldü");
      } catch (re) {
        step("auto_rollback", "fail", `Otomatik geri alma başarısız: ${re instanceof Error ? re.message : String(re)} — sürüm geçmişinden kontrol edin`);
      }
      refreshPublic(before.map((b) => b.path));
    }
    const retry = err.retryable && opts.via === "auto_48h" && a.attempts < MAX_AUTO_ATTEMPTS;
    const next = retry ? new Date(now.getTime() + RETRY_BASE_MS * 2 ** (a.attempts - 1)) : null;
    await db.autopilotAction.update({
      where: { id },
      data: retry
        ? { status: "pending_approval", nextAttemptAt: next, error: err.message, validation: log as object, qualityNotes: `Deneme ${a.attempts}/${MAX_AUTO_ATTEMPTS} başarısız: ${err.message} · yeniden denenecek` }
        : { status: "failed", nextAttemptAt: null, error: err.message, validation: log as object, rollbackAvailable: false, decidedBy: user.name },
    });
    await db.auditLog.create({ data: { action: retry ? "proposal.apply.retry" : "proposal.apply.fail", entity: "autopilotAction", entityId: id, detail: { via: opts.via, error: err.message, attempt: a.attempts, rolledBack: mutated } } });
    return { ok: false, status: retry ? "retry" : "failed", note: err.message };
  }
}

async function crawlCheck(changes: ProposedChanges, f: typeof fetch | null): Promise<[Step["status"], string]> {
  if (!f) return ["not_verifiable", "Tarama kontrolü bu ortamda yapılamadı (çalışan site yok)"];
  const st = await loadSiteState();
  const notes: string[] = [];
  for (const set of changes.pages) {
    const pg = st.pages.find((p) => p.id === set.pageId);
    if (!pg || pg.status !== "PUBLISHED") continue;
    const expectTitle = set.changes.some((c) => c.field === "seoTitle") ? resolveTitle(pg, st.settings.seo) : null;
    const expectLinks = set.changes.filter((c) => c.field === "relatedLinks").flatMap((c) => ((c.after as Link[] | null) ?? []).filter((l) => !((c.before as Link[] | null) ?? []).some((x) => x.path === l.path)).map((l) => l.path));
    // Gövdeye eklenen bölüm: yeni başlıkların metni sayfada görünmeli
    const bodyChange = set.changes.find((c) => c.field === "body");
    const oldHeads = new Set(extractMarkdown(typeof bodyChange?.before === "string" ? bodyChange.before : "").headings.map((h) => h.text));
    const expectHeadings = bodyChange ? extractMarkdown(String(bodyChange.after ?? "")).headings.map((h) => h.text).filter((t) => !oldHeads.has(t)) : [];
    const published = set.changes.some((c) => c.field === "status" && c.after === "PUBLISHED");
    let last = "";
    let passed = false;
    let html = "";
    for (let i = 0; i < 3 && !passed; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1000));
      let res;
      try {
        res = await fetchFollow(internalBase() + set.path, f);
      } catch (e) {
        return ["not_verifiable", `Site yanıt vermedi (${e instanceof Error ? e.message : e}); tarama kontrolü doğrulanamadı`];
      }
      html = decodeHtml(res.body ?? "");
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const problems = [
        res.status !== 200 && `HTTP ${res.status}`,
        expectTitle && !html.includes(`<title>${expectTitle}</title>`) && "yeni title HTML'de yok",
        ...expectLinks.filter((l) => !html.includes(`href="${l}"`)).map((l) => `${l} linki HTML'de yok`),
        ...expectHeadings.filter((h) => !text.includes(h)).map((h) => `eklenen bölüm (“${h}”) HTML'de yok`),
        published && pg.h1 && !text.includes(pg.h1) && "H1 HTML'de yok",
      ].filter(Boolean) as string[];
      passed = problems.length === 0;
      last = problems.join(", ");
    }
    if (!passed) throw new PipelineError(`Tarama kontrolü: ${set.path} — ${last}`, true);
    const extra: string[] = [];
    if (published) extra.push(...(await publishChecks(html, set.path, f)));
    notes.push(`${set.path} 200${expectTitle ? ", title doğru" : ""}${expectLinks.length ? ", link görünüyor" : ""}${expectHeadings.length ? ", yeni bölüm görünüyor" : ""}${extra.length ? `, ${extra.join(", ")}` : ""}`);
  }
  return notes.length ? ["ok", notes.join("; ")] : ["skipped", "Yayında olan etkilenen sayfa yok"];
}

/** Yeni yayınlanan sayfa: canonical kendisi, JSON-LD ayrıştırılabilir, sitemap'te var. */
async function publishChecks(html: string, path: string, f: typeof fetch): Promise<string[]> {
  const canon = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
  let canonPath: string | null = null;
  try {
    canonPath = canon ? new URL(canon).pathname.replace(/\/$/, "") || "/" : null;
  } catch { /* geçersiz canonical */ }
  if (canonPath !== path) throw new PipelineError(`Tarama kontrolü: ${path} — canonical kendisi değil (${canon ?? "yok"})`, false);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new PipelineError(`Tarama kontrolü: ${path} — yapılandırılmış veri (JSON-LD) yok`, false);
  for (const b of blocks) {
    try {
      JSON.parse(b);
    } catch {
      throw new PipelineError(`Tarama kontrolü: ${path} — JSON-LD ayrıştırılamıyor`, false);
    }
  }
  // Sitemap: dizin → alt sitemap'ler (kanonik alan adı iç adrese çevrilerek okunur)
  const toInternal = (u: string) => u.replace(siteUrl(), internalBase());
  const read = async (u: string) => {
    const r = await f(toInternal(u));
    return r.ok ? [...(await r.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]) : [];
  };
  const index = await read(`${siteUrl()}/sitemap.xml`);
  const urls = (await Promise.all(index.filter((u) => u.endsWith(".xml")).map(read))).flat();
  if (!urls.some((u) => u.replace(/\/$/, "") === `${siteUrl()}${path}`)) throw new PipelineError(`Tarama kontrolü: ${path} sitemap'te yok`, true);
  return ["canonical kendisi", `JSON-LD geçerli (${blocks.length})`, "sitemap'te"];
}

/** Uygulama sonrası adım başarısızsa sayfaları tam anlık görüntüye döndürür. */
async function revert(a: Row, before: { pageId: string; path: string; snapshot: Record<string, unknown> }[], user: SessionUser) {
  if (a.type === "NEW_PAGE") {
    const pg = await db.page.findUnique({ where: { id: before[0]?.pageId ?? "" } });
    if (pg?.status === "PUBLISHED") await rollbackNewPage({ ...a, pageId: pg.id }, user);
    return;
  }
  for (const b of before) {
    const r = await savePage(user, b.pageId, pageInputSchema.parse({ ...b.snapshot, faq: parseFaq(b.snapshot.faq) }), `Öneri uygulaması başarısız — otomatik geri alındı: ${a.title}`.slice(0, 300));
    if (!r.ok) throw new Error(r.error);
  }
}

// ─── Reddet / geri al ────────────────────────────────────────────────────────

export async function rejectProposal(user: SessionUser, id: string) {
  const r = await db.autopilotAction.updateMany({
    where: { id, status: { in: ["pending_approval", "needs_approval", "blocked", "planned"] } },
    data: { status: "rejected", rejectedAt: clock.now(), decidedBy: user.name, autoApply: false, qualityNotes: `Reddedildi (${user.name})` },
  });
  if (r.count !== 1) throw new Error("Bu öneri reddedilebilir durumda değil");
  // Yeni sayfa hazırlığında üst sayfaya eklenen (taslağa işaret ettiği için görünmeyen) link temizlenir
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  const prop = (a.proposal ?? {}) as { parentPath?: string | null; pagePath?: string };
  if (a.type === "NEW_PAGE" && prop.parentPath && prop.pagePath) {
    const parent = await db.page.findUnique({ where: { path: prop.parentPath } });
    const rel = (parent?.relatedLinks as Link[] | null) ?? [];
    const draft = await db.page.findUnique({ where: { path: prop.pagePath }, select: { status: true } });
    if (parent && draft?.status !== "PUBLISHED" && rel.some((l) => l.path === prop.pagePath)) {
      const rest = rel.filter((l) => l.path !== prop.pagePath);
      await savePage(AUTOPILOT_USER, parent.id, await inputWith(parent.id, { relatedLinks: rest.length ? rest : null }), `Reddedilen yeni sayfa önerisinin iç linki kaldırıldı (${prop.pagePath})`);
    }
  }
  await db.auditLog.create({ data: { userId: user.id === AUTOPILOT_USER.id ? null : user.id, action: "proposal.reject", entity: "autopilotAction", entityId: id } });
}

/** Geri al: değişen alanlar önceki değerine döner (sonradan elle değiştirilmişse reddedilir). */
export async function rollbackProposal(user: SessionUser, id: string): Promise<string[]> {
  const a = await db.autopilotAction.findUniqueOrThrow({ where: { id } });
  if (a.status !== "applied") throw new Error("Yalnızca uygulanmış öneri geri alınabilir");
  const changes = a.proposedChanges as ProposedChanges | null;
  if (!hasChanges(changes) || a.type === "NEW_PAGE") {
    await rollbackAction(user, id); // eski kayıtlar ve yeni sayfa: mevcut geri alma
    await db.autopilotAction.update({ where: { id }, data: { rollbackAvailable: false } });
    return changes?.pages.map((p) => p.path) ?? [];
  }
  const paths: string[] = [];
  for (const set of changes.pages) {
    const pg = await db.page.findUniqueOrThrow({ where: { id: set.pageId } });
    const cur = snapshotOf(pg as unknown as Record<string, unknown>);
    const patch: Record<string, unknown> = {};
    for (const c of set.changes as FieldChange[]) {
      if (c.field === "relatedLinks") {
        patch.relatedLinks = mergeLinks(cur.relatedLinks, c.after, c.before);
        continue;
      }
      if (diffFields({ [c.field]: cur[c.field] ?? null }, { [c.field]: c.after ?? null }).length) {
        throw new Error(`“${c.field}” alanı öneri uygulandıktan sonra elle değiştirilmiş (${set.path}); sürüm geçmişinden kontrol edin`);
      }
      patch[c.field] = c.before;
    }
    const r = await savePage(user, set.pageId, await inputWith(set.pageId, patch as Partial<PageInput>), `Öneri geri alındı: ${a.title}`.slice(0, 300));
    if (!r.ok) throw new Error(r.error);
    paths.push(set.path);
  }
  await db.autopilotAction.update({ where: { id }, data: { status: "rolled_back", rollbackAvailable: false } });
  await db.experiment.updateMany({ where: { actionId: id }, data: { status: "rolled_back" } });
  await db.auditLog.create({ data: { userId: user.id === AUTOPILOT_USER.id ? null : user.id, action: "proposal.rollback", entity: "autopilotAction", entityId: id, detail: { paths } } });
  refreshPublic(paths);
  return paths;
}

// ─── Zamanlanmış otomatik uygulama ───────────────────────────────────────────

export type AutoApplySummary = { due: number; applied: number; failed: number; retry: number; skipped: number; recovered: number; expiredManual: number };

/**
 * Süresi dolan ve otomatik uygulamaya uygun önerileri uygular. İdempotent: aynı öneriyi
 * iki süreç görse de sahiplenme yalnızca birine izin verir.
 */
export async function runAutoApply(opts: { now?: Date; fetchImpl?: typeof fetch | null; max?: number } = {}): Promise<AutoApplySummary> {
  const now = opts.now ?? clock.now();
  // Yarıda kalan uygulamalar (süreç kesildi): kira süresi dolduysa hataya çekilir
  const stale = await db.autopilotAction.updateMany({
    where: { status: "applying", nextAttemptAt: { lt: now } },
    data: { status: "failed", error: "Uygulama yarıda kaldı (süreç kesilmiş olabilir); sayfayı sürüm geçmişinden kontrol edin", nextAttemptAt: null },
  });
  const due = await db.autopilotAction.findMany({
    where: { status: "pending_approval", autoApply: true, expiresAt: { lte: now }, riskLevel: { in: ["LOW", "MEDIUM"] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { expiresAt: "asc" },
    take: opts.max ?? 10,
    select: { id: true },
  });
  const s: AutoApplySummary = { due: due.length, applied: 0, failed: 0, retry: 0, skipped: 0, recovered: stale.count, expiredManual: 0 };
  for (const d of due) {
    const r = await applyProposal(d.id, { via: "auto_48h", now, fetchImpl: opts.fetchImpl });
    if (r.status === "applied") s.applied++;
    else if (r.status === "retry") s.retry++;
    else if (r.status === "failed") s.failed++;
    else s.skipped++;
  }
  s.expiredManual = await db.autopilotAction.count({ where: { status: "pending_approval", autoApply: false, expiresAt: { lte: now } } });
  return s;
}
