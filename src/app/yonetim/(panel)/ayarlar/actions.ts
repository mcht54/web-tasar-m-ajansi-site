"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { deleteSecret, getSettingsFresh, saveSetting, setSecret, SETTINGS_TAG } from "@/lib/settings";
import type { SettingKey } from "@/lib/settings-schema";
import { refreshPublic } from "@/lib/admin/pages";
import { siteHost } from "@/lib/env";
import { checkRobotsRules } from "@/lib/seo/robots";
import { GscClient, parseServiceAccount } from "@/lib/gsc/client";
import { GSC_SECRET } from "@/lib/gsc/sync";
import { getSecret } from "@/lib/settings";
import { SMTP_SECRET } from "@/lib/email/send";
import { sendWeeklyEmail } from "@/lib/autopilot/weekly";
import { GSC_CLIENT_SECRET, disconnect as disconnectGsc } from "@/lib/gsc/oauth";
import { ANTHROPIC_SECRET, loadAiKey, resetAiKeyCache } from "@/lib/ai/key";
import { claudeAvailable, testAnthropic } from "@/lib/ai/claude";

const back = (tab: string, q: string) => `/yonetim/ayarlar?sekme=${tab}&${q}`;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function persist(key: SettingKey, value: unknown, tab: string, userId: string) {
  try {
    await saveSetting(key, value);
  } catch (e) {
    const msg = e instanceof Error && "issues" in e ? (e as { issues: { message: string }[] }).issues.map((i) => i.message).join("; ") : "Geçersiz değer";
    redirect(back(tab, `hata=${encodeURIComponent(msg)}`));
  }
  await audit(userId, "settings.update", "Setting", key);
  updateTag(SETTINGS_TAG);
  refreshPublic();
  redirect(back(tab, "kaydedildi=1"));
}

export async function saveSiteAction(f: FormData) {
  const user = await requireUser("settings");
  await persist("site", {
    siteName: str(f, "siteName"), logoId: str(f, "logoId"), faviconId: str(f, "faviconId"), email: str(f, "email"),
    whatsapp: str(f, "whatsapp").replace(/\D/g, ""),
    social: { instagram: str(f, "instagram"), facebook: str(f, "facebook"), linkedin: str(f, "linkedin"), x: str(f, "x"), youtube: str(f, "youtube") },
  }, "site", user.id);
}

export async function saveSeoAction(f: FormData) {
  const user = await requireUser("settings");
  const current = await getSettingsFresh();
  const wantIndexing = f.get("allowIndexing") === "on";
  // Güvenlik kilidi: indekslemeyi kapatmak için alan adı yazılmalı.
  if (current.seo.allowIndexing && !wantIndexing && str(f, "confirmDomain") !== siteHost()) {
    redirect(back("seo", `hata=${encodeURIComponent(`İndekslemeyi kapatmak için onay kutusuna “${siteHost()}” yazın`)}`));
  }
  const tpl = str(f, "titleTemplate");
  if (tpl && !tpl.includes("%page%")) redirect(back("seo", `hata=${encodeURIComponent("Başlık şablonu %page% içermeli")}`));
  const num = (k: string) => Number(f.get(k)) || undefined;
  await persist("seo", {
    titleTemplate: tpl, defaultTitle: str(f, "defaultTitle"), defaultDescription: str(f, "defaultDescription"),
    defaultOgImageId: str(f, "defaultOgImageId"), allowIndexing: wantIndexing,
    aiSearchBots: f.get("aiSearchBots") === "on", aiTrainingBots: f.get("aiTrainingBots") === "on",
    duplicateThreshold: Number(f.get("duplicateThreshold")) / 100 || current.seo.duplicateThreshold,
    minWords: Object.fromEntries(Object.keys(current.seo.minWords).map((k) => [k, num(`min_${k}`) ?? (current.seo.minWords as Record<string, number>)[k]])),
  }, "seo", user.id);
}

export async function saveBusinessAction(f: FormData) {
  const user = await requireUser("settings");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const hours = [0, 1, 2].map((i) => ({ days: f.getAll(`h${i}_days`).map(String).filter((d) => days.includes(d)), opens: str(f, `h${i}_opens`), closes: str(f, `h${i}_closes`) }))
    .filter((h) => h.days.length && h.opens && h.closes);
  const coord = (k: string) => (str(f, k) ? Number(str(f, k).replace(",", ".")) : null);
  await persist("business", {
    name: str(f, "name"), legalName: str(f, "legalName"), type: str(f, "type") || "LocalBusiness", phone: str(f, "phone"),
    email: str(f, "email"), street: str(f, "street"), district: str(f, "district"), city: str(f, "city"), postalCode: str(f, "postalCode"),
    lat: coord("lat"), lng: coord("lng"), openingHours: hours,
    services: str(f, "services").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    foundingYear: str(f, "foundingYear") ? Number(str(f, "foundingYear")) : null, priceRange: str(f, "priceRange"),
  }, "isletme", user.id);
}

export async function saveIntegrationsAction(f: FormData) {
  const user = await requireUser("settings");
  const json = str(f, "gscJson");
  if (json) {
    try {
      parseServiceAccount(json);
    } catch (e) {
      redirect(back("entegrasyon", `hata=${encodeURIComponent((e as Error).message)}`));
    }
    await setSecret(GSC_SECRET, json);
    await audit(user.id, "secret.set", "Secret", GSC_SECRET);
  }
  if (f.get("removeGsc") === "on") {
    await deleteSecret(GSC_SECRET);
    await audit(user.id, "secret.delete", "Secret", GSC_SECRET);
  }
  let verification = str(f, "gscVerification");
  const m = /content="([^"]+)"/.exec(verification);
  if (m) verification = m[1]; // tam meta etiketi yapıştırıldıysa
  const metaContent = (k: string) => {
    const v = str(f, k);
    return /content="([^"]+)"/.exec(v)?.[1] ?? v;
  };
  const keep = (await getSettingsFresh()).integrations; // bu formda olmayan alanlar korunur
  await persist("integrations", {
    gscClientId: keep.gscClientId,
    gaId: str(f, "gaId").toUpperCase(), gtmId: str(f, "gtmId").toUpperCase(), gscProperty: str(f, "gscProperty"),
    gscVerification: verification, aiProvider: str(f, "aiProvider") || "none", aiModel: str(f, "aiModel") || undefined,
    bingVerification: metaContent("bingVerification"), yandexVerification: metaContent("yandexVerification"),
    indexNow: f.get("indexNow") === "on",
  }, "entegrasyon", user.id);
}

export async function testGscAction() {
  await requireUser("settings");
  const [secret, settings] = await Promise.all([getSecret(GSC_SECRET), getSettingsFresh()]);
  if (!secret) redirect(back("entegrasyon", `hata=${encodeURIComponent("Servis hesabı JSON'u kayıtlı değil")}`));
  let msg: string;
  try {
    const sa = parseServiceAccount(secret);
    const sites = await new GscClient(sa, settings.integrations.gscProperty).listSites();
    const has = sites.find((s) => s.siteUrl === settings.integrations.gscProperty);
    msg = has
      ? `Bağlantı başarılı: ${has.siteUrl} (${has.permissionLevel})`
      : `Kimlik doğrulandı ama “${settings.integrations.gscProperty || "(mülk girilmedi)"}” erişilebilir mülkler arasında yok. Erişilebilen: ${sites.map((s) => s.siteUrl).join(", ") || "hiçbiri"}. Servis hesabı e-postasını (${sa.client_email}) Search Console'da kullanıcı olarak ekleyin.`;
  } catch (e) {
    redirect(back("entegrasyon", `hata=${encodeURIComponent((e as Error).message)}`));
  }
  redirect(back("entegrasyon", `test=${encodeURIComponent(msg)}`));
}

export async function saveRobotsAction(f: FormData) {
  const user = await requireUser("settings");
  const rules = String(f.get("extraRules") ?? "").slice(0, 4000);
  const important = (await db.page.findMany({ where: { status: "PUBLISHED", robotsIndex: true }, select: { path: true } })).map((p) => p.path);
  const check = checkRobotsRules(rules, important);
  if (check.errors.length) redirect(back("robots", `hata=${encodeURIComponent(check.errors.join(" "))}`));
  await saveSetting("robots", { extraRules: rules });
  await audit(user.id, "settings.update", "Setting", "robots", { warnings: check.warnings });
  updateTag(SETTINGS_TAG);
  refreshPublic(["/robots.txt"]);
  redirect(back("robots", check.warnings.length ? `uyari=${encodeURIComponent(check.warnings.join(" "))}` : "kaydedildi=1"));
}


export async function saveEmailAction(f: FormData) {
  const user = await requireUser("settings");
  const pass = String(f.get("smtpPassword") ?? "");
  if (pass) {
    await setSecret(SMTP_SECRET, pass);
    await audit(user.id, "secret.set", "Secret", SMTP_SECRET);
  }
  if (f.get("removeSmtp") === "on") {
    await deleteSecret(SMTP_SECRET);
    await audit(user.id, "secret.delete", "Secret", SMTP_SECRET);
  }
  await persist("email", {
    enabled: f.get("enabled") === "on", recipient: str(f, "recipient"), day: Number(f.get("day")), hour: Number(f.get("hour")),
    criticalAlarms: f.get("criticalAlarms") === "on", notifyRising: f.get("notifyRising") === "on", notifyFalling: f.get("notifyFalling") === "on",
    dailyReport: f.get("dailyReport") === "on", dailyHour: Number(f.get("dailyHour") ?? 9),
    smtpHost: str(f, "smtpHost"), smtpPort: Number(f.get("smtpPort")) || 587,
    smtpEncryption: (["none", "starttls", "ssl"].includes(str(f, "smtpEncryption")) ? str(f, "smtpEncryption") : "starttls"), smtpSecure: str(f, "smtpEncryption") === "ssl",
    smtpUser: str(f, "smtpUser"), smtpFrom: str(f, "smtpFrom"), smtpFromName: str(f, "smtpFromName"),
  }, "eposta", user.id);
}

export async function testEmailAction() {
  const user = await requireUser("settings");
  const r = await sendWeeklyEmail("test");
  await audit(user.id, "email.test", "EmailLog", r.id, { status: r.status });
  const msg = r.status === "sent" ? "Test e-postası gönderildi." : r.status === "logged" ? "Test e-postası kaydedildi (EMAIL_TRANSPORT=log; gönderim yapılmadı)." : `Test e-postası gönderilemedi: ${r.error}`;
  redirect(back("eposta", `test=${encodeURIComponent(msg)}`));
}

export async function saveAutopilotAction(f: FormData) {
  const user = await requireUser("settings");
  await persist("autopilot", {
    mode: str(f, "mode") || "AUTONOMOUS", enabled: f.get("enabled") === "on", autoApplySafe: f.get("autoApplySafe") === "on", autoApplyControlled: f.get("autoApplyControlled") === "on",
    maxChangesPerWeek: Number(f.get("maxChangesPerWeek")), maxNewPagesPerWeek: Number(f.get("maxNewPagesPerWeek") ?? 3),
    approvalWindowHours: Number(f.get("approvalWindowHours") ?? 48),
    cycleHours: Number(f.get("cycleHours") ?? 6), maxActionsPerCycle: Number(f.get("maxActionsPerCycle") ?? 3), instantApply: f.get("instantApply") === "on",
  }, "otopilot", user.id);
}

// ─── Google Search Console (OAuth) ───────────────────────────────────────────
async function patchIntegrations(patch: Record<string, unknown>) {
  const cur = await getSettingsFresh();
  await saveSetting("integrations", { ...cur.integrations, ...patch });
  updateTag(SETTINGS_TAG);
}

export async function saveGscOAuthAction(f: FormData) {
  const user = await requireUser("settings");
  const clientId = str(f, "gscClientId");
  const secret = String(f.get("gscClientSecret") ?? "").trim();
  if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) redirect(back("entegrasyon", `hata=${encodeURIComponent("İstemci kimliği …apps.googleusercontent.com ile bitmeli")}`));
  await patchIntegrations({ gscClientId: clientId });
  if (secret) {
    await setSecret(GSC_CLIENT_SECRET, secret);
    await audit(user.id, "secret.set", "Secret", GSC_CLIENT_SECRET);
  }
  redirect(back("entegrasyon", "kaydedildi=1"));
}

export async function selectGscPropertyAction(f: FormData) {
  const user = await requireUser("settings");
  await patchIntegrations({ gscProperty: str(f, "gscProperty") });
  await audit(user.id, "settings.update", "Setting", "integrations.gscProperty", { property: str(f, "gscProperty") });
  redirect(back("entegrasyon", `test=${encodeURIComponent("Search Console mülkü seçildi; veriler bir sonraki senkronda (en geç gece 02:00) çekilir.")}`));
}

export async function disconnectGscAction() {
  const user = await requireUser("settings");
  await disconnectGsc();
  await audit(user.id, "gsc.oauth.disconnect", "Secret", "gsc.oauth");
  redirect(back("entegrasyon", `test=${encodeURIComponent("Search Console bağlantısı kesildi (Google tarafında da iptal edildi).")}`));
}

// ─── Anthropic API anahtarı ──────────────────────────────────────────────────
export async function saveAnthropicAction(f: FormData) {
  const user = await requireUser("settings");
  const key = String(f.get("anthropicKey") ?? "").trim();
  if (key) {
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) redirect(back("entegrasyon", `hata=${encodeURIComponent("Geçerli bir Anthropic API anahtarı değil (sk-ant-… biçiminde olmalı)")}`));
    await setSecret(ANTHROPIC_SECRET, key);
    await audit(user.id, "secret.set", "Secret", ANTHROPIC_SECRET);
  }
  if (f.get("removeAnthropic") === "on") {
    await deleteSecret(ANTHROPIC_SECRET);
    await audit(user.id, "secret.delete", "Secret", ANTHROPIC_SECRET);
  }
  await patchIntegrations({ aiProvider: f.get("aiEnabled") === "on" ? "anthropic" : "none", aiModel: str(f, "aiModel") || undefined });
  resetAiKeyCache();
  redirect(back("entegrasyon", "kaydedildi=1"));
}

export async function testAnthropicAction() {
  await requireUser("settings");
  await loadAiKey(true);
  const settings = await getSettingsFresh();
  const r = claudeAvailable() ? await testAnthropic(settings.integrations.aiModel) : { ok: false, message: "Anahtar kayıtlı değil" };
  redirect(back("entegrasyon", `test=${encodeURIComponent(r.ok ? `Bağlantı başarılı — ${r.message.replace(/^Bağlantı başarılı: /, "")}` : `Yapay zekâ bağlantısı başarısız: ${r.message}`)}`));
}
