import "server-only";
// İÇERİK OTOPİLOTU: fırsatları bütçe dahilinde öneriye çevirir. Her öneri 48 saatlik
// yaşam döngüsünden geçer (lifecycle.ts): oluşturulduğu anda içerik üretilir + kalite
// kapısı; onay/ret/süre dolumu; uygulama hattı; geri alma.

import { db } from "../db";
import { getSettingsFresh } from "../settings";
import { agentMode } from "../settings-schema";
import { classifyIntent } from "../autopilot/intent";
import { createProposal, type CreateResult } from "../proposals/lifecycle";
import { contentBudget, type Budget } from "./strategy";
import { districtPriorities, refreshCandidates, serviceOpportunities } from "./opportunities";

export type ScanKind = "refresh" | "service" | "local";
export type ScanSummary = { budget: Budget; created: Record<string, number>; items: { title: string; status: string; note: string }[]; skippedReason?: string };

const NEW_PAGE_SOURCES = ["service", "local", "autopilot"];

export async function runContentScan(kinds: ScanKind[], opts: { now?: Date } = {}): Promise<ScanSummary> {
  const now = opts.now ?? new Date();
  const settings = await getSettingsFresh();
  const ap = settings.autopilot;
  const mode = agentMode(ap);
  const since = new Date(now.getTime() - 7 * 86400_000);
  const refresh = kinds.includes("refresh") ? await refreshCandidates(now) : [];
  const [indexable, newPages, refreshed] = await Promise.all([
    db.page.count({ where: { status: "PUBLISHED", robotsIndex: true, autoNoindex: false } }),
    db.autopilotAction.count({ where: { type: "NEW_PAGE", source: { in: NEW_PAGE_SOURCES }, createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
    db.autopilotAction.count({ where: { type: "CONTENT", createdAt: { gte: since }, status: { in: ["pending_approval", "applying", "applied"] } } }),
  ]);
  const budget = contentBudget({ indexablePages: indexable, weakPages: refresh.length, maxNewPagesPerWeek: ap.maxNewPagesPerWeek, maxChangesPerWeek: ap.maxChangesPerWeek, createdLast7: { newPages, refresh: refreshed } });
  const s: ScanSummary = { budget, created: {}, items: [] };
  if (mode === "OBSERVE") return { ...s, skippedReason: "OBSERVE modu: yalnızca ölçülür, öneri oluşturulmaz" };
  const model = settings.integrations.aiModel;
  const window = { model, windowHours: ap.approvalWindowHours || 48 };
  const track = (title: string, r: CreateResult) => {
    s.created[r.status] = (s.created[r.status] ?? 0) + 1;
    s.items.push({ title, status: r.status, note: r.note });
  };

  // 1) İçerik yenileme: mevcut sayfaya tek, kalite kapılı bölüm (mevcut metin korunur)
  let refreshLeft = budget.refreshThisRun;
  for (const c of refresh) {
    if (refreshLeft <= 0) break;
    const title = `${c.path} içerik yenileme`;
    const r = await createProposal({
      key: `CONTENT:${c.pageId}`, type: "CONTENT", risk: "CONTROLLED", category: "CONTENT", source: "content", title, reason: c.reasons.join(" · "),
      score: Math.min(100, c.score), pageId: c.pageId, query: c.query, proposal: { pagePath: c.path, evidence: c.reasons.join(" · "), recommendedAction: "Sayfanın arama niyetine hizmet eden tek bir yeni bölüm (mevcut metin korunur)" },
      allowAuto: mode === "AUTONOMOUS" && ap.autoApplyControlled, noAutoReason: mode === "ASSIST" ? "ASSIST modu: öneri hazır, onayla uygulanır" : "Kontrollü içerik otomatik uygulaması kapalı",
    }, window);
    if (r.duplicate) continue; // bütçe tüketmez
    track(title, r);
    if (r.status === "pending_approval") refreshLeft--;
    else if (r.status === "blocked") break; // ön koşul (ör. yapay zekâ anahtarı) tüm adaylar için aynı: tekrar denemeye gerek yok
  }

  // 2) Yeni sayfalar (hizmet + ilçe): ortak haftalık yeni sayfa bütçesi
  let newLeft = budget.newPagesThisRun;
  let attempts = newLeft + 2; // engellenen öneriler görünür olsun ama yığılmasın
  if (kinds.includes("service") && newLeft > 0) {
    const { rows } = await serviceOpportunities();
    for (const d of rows) {
      if (newLeft <= 0 || attempts <= 0) break;
      if (d.decision === "EXPAND_EXISTING" && d.coveredBy && (d.gscImpressions || d.trackedKeywords)) {
        const page = await db.page.findUnique({ where: { path: d.coveredBy }, select: { id: true } });
        if (!page) continue;
        attempts--;
        track(`${d.coveredBy} — ${d.name} kapsamı`, await createProposal({
          key: `CONTENT:${page.id}`, type: "CONTENT", risk: "CONTROLLED", category: "SERVICE", source: "service", title: `${d.coveredBy} sayfasına “${d.name}” bölümü`,
          reason: d.reason, score: d.score, pageId: page.id, query: d.primary, proposal: { pagePath: d.coveredBy, evidence: d.reason }, allowAuto: mode === "AUTONOMOUS" && ap.autoApplyControlled,
        }, window));
        continue;
      }
      if (d.decision !== "NEW_SERVICE_PAGE") continue;
      attempts--;
      const r = await createProposal({
        key: `NEW_PAGE:service:${d.path}`, type: "NEW_PAGE", risk: "CONTROLLED", category: "SERVICE", source: "service", title: `Yeni hizmet sayfası: ${d.path} (“${d.primary}”)`,
        reason: d.reason, score: d.score, proposal: { pagePath: d.path, decision: "NEW_SERVICE_PAGE", pageType: "SERVICE", pageId: null, service: { name: d.name, summary: d.summary || null }, evidence: d.reason, group: { primary: d.primary, queries: d.queries.length ? d.queries : [d.primary], impressions: d.gscImpressions ?? 0, intent: "COMMERCIAL", location: null } },
        allowAuto: mode === "AUTONOMOUS",
      }, window);
      track(`Yeni hizmet sayfası: ${d.path}`, r);
      if (r.status === "pending_approval") newLeft--;
    }
  }
  if (kinds.includes("local") && newLeft > 0) {
    const { rows } = await districtPriorities();
    for (const d of rows.filter((x) => x.pageId).slice(0, Math.max(0, attempts))) {
      if (newLeft <= 0) break;
      const primary = `${d.name} web tasarım`;
      const r = await createProposal({
        key: `NEW_PAGE:local:${d.pageId}`, type: "NEW_PAGE", risk: "HUMAN", category: "LOCAL", source: "local", title: `İlçe sayfası: ${d.path} (öncelik ${d.score})`,
        reason: `Öncelik skoru ${d.score}: ${Object.entries(d.parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ")}`, score: d.score, pageId: d.pageId,
        proposal: { pagePath: d.path, decision: "FILL_LOCATION_DRAFT", pageType: "DISTRICT", pageId: d.pageId, evidence: d.blockers.length ? `Eksik ön koşullar: ${d.blockers.join("; ")}` : "Ön koşullar tamam", group: { primary, queries: [primary], impressions: 0, intent: classifyIntent(primary, { hasLocation: true }).primary, location: { provinceId: d.provinceId, districtId: d.districtId } } },
        // Doorway riski: ilçe sayfaları ilk aşamada yalnızca insan onayıyla yayınlanır
        allowAuto: false, noAutoReason: "İlçe sayfaları doorway riski nedeniyle yalnızca insan onayıyla yayınlanır",
      }, window);
      track(`İlçe sayfası: ${d.path}`, r);
      if (r.status === "pending_approval") newLeft--;
    }
  }
  return s;
}
