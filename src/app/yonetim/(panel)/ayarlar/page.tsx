import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getSecret, getSettingsFresh } from "@/lib/settings";
import { siteHost, siteUrl } from "@/lib/env";
import { GSC_SECRET } from "@/lib/gsc/sync";
import { buildRobotsTxt } from "@/lib/seo/robots";
import { Card, Field, Notice, PageTitle, inputCls } from "@/components/admin/ui";
import { disconnectGscAction, saveAnthropicAction, saveAutopilotAction, saveBusinessAction, saveEmailAction, saveGscOAuthAction, saveIntegrationsAction, saveRobotsAction, saveSeoAction, saveSiteAction, selectGscPropertyAction, testAnthropicAction, testEmailAction, testGscAction } from "./actions";
import { GSC_CLIENT_SECRET, oauthConfig, oauthConnection, oauthTokenSource, redirectUri } from "@/lib/gsc/oauth";
import { GscClient } from "@/lib/gsc/client";
import { ANTHROPIC_SECRET, maskKey } from "@/lib/ai/key";
import { smtpEncryptionOf } from "@/lib/settings-schema";
import { SMTP_SECRET } from "@/lib/email/send";
import { hasSecret } from "@/lib/settings";
import { PAGE_TYPE_LABELS } from "@/lib/admin/labels";

export const metadata = { title: "Ayarlar" };
const TABS = [["site", "Site"], ["seo", "SEO"], ["isletme", "İşletme / LocalBusiness"], ["entegrasyon", "Entegrasyonlar"], ["robots", "robots.txt"], ["eposta", "Bildirimler (SMTP)"], ["otopilot", "SEO Otopilot"]] as const;
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DAYS: [string, string][] = [["Monday", "Pzt"], ["Tuesday", "Sal"], ["Wednesday", "Çar"], ["Thursday", "Per"], ["Friday", "Cum"], ["Saturday", "Cmt"], ["Sunday", "Paz"]];

export default async function Settings(props: PageProps<"/yonetim/ayarlar">) {
  await requireUser("settings");
  const sp = await props.searchParams;
  const tab = (typeof sp.sekme === "string" ? sp.sekme : "site") as (typeof TABS)[number][0];
  const [s, media, gscSecret, smtpSaved, lastMail] = await Promise.all([getSettingsFresh(), db.media.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, filename: true } }), getSecret(GSC_SECRET), hasSecret(SMTP_SECRET), db.emailLog.findFirst({ orderBy: { createdAt: "desc" } })]);
  const [oauth, oauthCfg, clientSecretSaved, anthropicKey, lastSync, lastDay] = await Promise.all([
    oauthConnection(), oauthConfig(), hasSecret(GSC_CLIENT_SECRET), getSecret(ANTHROPIC_SECRET),
    db.jobRun.findFirst({ where: { kind: { in: ["gsc-sync", "daily"] }, status: { in: ["ok", "skipped", "error"] } }, orderBy: { startedAt: "desc" } }),
    db.gscDailyTotal.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  let properties: { siteUrl: string; permissionLevel: string }[] | null = null;
  let propertyError: string | null = null;
  if (tab === "entegrasyon" && oauth && oauthCfg) {
    try {
      properties = await Promise.race([new GscClient(oauthTokenSource(oauth, oauthCfg), "").listSites(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Google yanıt vermedi")), 8000))]);
    } catch (e) {
      propertyError = (e as Error).message;
    }
  }
  let gscEmail: string | null = null;
  try {
    gscEmail = gscSecret ? (JSON.parse(gscSecret) as { client_email: string }).client_email : null;
  } catch {
    gscEmail = null;
  }
  const mediaSelect = (name: string, value: string) => (
    <select name={name} defaultValue={value} className={inputCls}><option value="">— yok —</option>{media.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}</select>
  );
  const save = <button className="rounded-full bg-ink px-5 py-2 text-paper">Kaydet</button>;
  return (
    <>
      <PageTitle title="Ayarlar" />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {TABS.map(([k, l]) => <Link key={k} href={`?sekme=${k}`} className={`rounded-full px-3 py-1.5 ${tab === k ? "bg-ink text-paper" : "border border-line"}`}>{l}</Link>)}
      </div>
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      {typeof sp.hata === "string" && <div className="mb-4"><Notice tone="bad">{sp.hata}</Notice></div>}
      {typeof sp.uyari === "string" && <div className="mb-4"><Notice tone="warn">Kaydedildi, ancak: {sp.uyari}</Notice></div>}
      {typeof sp.test === "string" && <div className="mb-4"><Notice tone={sp.test.startsWith("Bağlantı başarılı") || sp.test.startsWith("Test e-postası gönderildi") ? "ok" : "warn"}>{sp.test}</Notice></div>}

      {tab === "site" && (
        <Card>
          <form action={saveSiteAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Site adı"><input name="siteName" defaultValue={s.site.siteName} className={inputCls} /></Field>
            <Field label="Genel e-posta"><input name="email" type="email" defaultValue={s.site.email} className={inputCls} /></Field>
            <Field label="Logo">{mediaSelect("logoId", s.site.logoId)}</Field>
            <Field label="Favicon" hint="Boşsa varsayılan ikon kullanılır. Kare bir görsel seçin.">{mediaSelect("faviconId", s.site.faviconId)}</Field>
            <Field label="WhatsApp (ülke koduyla, yalnızca rakam)" hint="Ör. 905xxxxxxxxx — doluysa mobilde WhatsApp butonu görünür"><input name="whatsapp" defaultValue={s.site.whatsapp} className={inputCls} /></Field>
            <div />
            {(["instagram", "facebook", "linkedin", "x", "youtube"] as const).map((k) => (
              <Field key={k} label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}><input name={k} defaultValue={s.site.social[k]} placeholder="https://…" className={inputCls} /></Field>
            ))}
            <div className="sm:col-span-2">{save}</div>
          </form>
        </Card>
      )}

      {tab === "seo" && (
        <Card>
          <form action={saveSeoAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Başlık şablonu" hint="%page% sayfa adıyla değiştirilir. Sayfaya özel title girilirse şablon kullanılmaz."><input name="titleTemplate" defaultValue={s.seo.titleTemplate} className={inputCls} /></Field>
            <Field label="Varsayılan (ana sayfa) title"><input name="defaultTitle" defaultValue={s.seo.defaultTitle} className={inputCls} /></Field>
            <Field label="Varsayılan meta description" className="sm:col-span-2"><textarea name="defaultDescription" defaultValue={s.seo.defaultDescription} rows={2} className={inputCls} /></Field>
            <Field label="Varsayılan OG görseli">{mediaSelect("defaultOgImageId", s.seo.defaultOgImageId)}</Field>
            <Field label="Kopya içerik eşiği (%)" hint="Başka sayfaya benzerlik bunu aşarsa kopya sayılır; il/ilçe sayfaları otomatik NOINDEX olur."><input name="duplicateThreshold" type="number" min={20} max={95} defaultValue={Math.round(s.seo.duplicateThreshold * 100)} className={inputCls} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-[13px] font-medium">Thin content eşikleri (en az kelime)</legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(s.seo.minWords).map(([k, v]) => <label key={k} className="text-xs">{PAGE_TYPE_LABELS[k]}<input name={`min_${k}`} type="number" min={100} defaultValue={v} className={inputCls} /></label>)}
              </div>
            </fieldset>
            <fieldset className="rounded-xl border border-line p-4 sm:col-span-2">
              <legend className="px-1 text-[13px] font-medium">Yapay zekâ görünürlüğü</legend>
              <label className="flex items-center gap-2"><input type="checkbox" name="aiSearchBots" defaultChecked={s.seo.aiSearchBots} /> AI arama/yanıt botlarına izin ver <span className="text-xs text-muted">(ChatGPT araması, Perplexity, Claude araması — kaynak linkiyle önerir)</span></label>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="aiTrainingBots" defaultChecked={s.seo.aiTrainingBots} /> AI eğitim botlarına izin ver <span className="text-xs text-muted">(GPTBot, ClaudeBot, Google-Extended… — modellerin markanızı tanıması için)</span></label>
              <p className="mt-2 text-xs text-muted">Site ayrıca <a href="/llms.txt" target="_blank" className="underline">/llms.txt</a> ve <a href="/llms-full.txt" target="_blank" className="underline">/llms-full.txt</a> yayınlar (yalnızca yayındaki, indekslenebilir sayfalar).</p>
            </fieldset>
            <div className="rounded-xl border border-bad/40 bg-bad/5 p-4 sm:col-span-2">
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="allowIndexing" defaultChecked={s.seo.allowIndexing} /> Site genelinde indekslemeye izin ver</label>
              <p className="mt-1 text-xs text-muted">Kapatılırsa tüm sayfalar NOINDEX olur ve sitemap boşalır — yalnızca geliştirme/test sunucuları için. Kapatmak için alan adını yazın:</p>
              <input name="confirmDomain" placeholder={siteHost()} className={`${inputCls} max-w-xs`} autoComplete="off" />
            </div>
            <div className="sm:col-span-2">{save}</div>
          </form>
        </Card>
      )}

      {tab === "isletme" && (
        <Card>
          <Notice>Bu bilgiler LocalBusiness/Organization yapılandırılmış verisini, footer&apos;ı ve iletişim sayfasını besler. Yalnızca gerçek bilgileri girin; ad, telefon ve adres eksikse LocalBusiness üretilmez.</Notice>
          <form action={saveBusinessAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="İşletme adı"><input name="name" defaultValue={s.business.name} className={inputCls} /></Field>
            <Field label="Ticari unvan"><input name="legalName" defaultValue={s.business.legalName} className={inputCls} /></Field>
            <Field label="Schema türü" hint="Google, mümkün olan en spesifik LocalBusiness türünü önerir.">
              <select name="type" defaultValue={s.business.type} className={inputCls}>
                <option value="LocalBusiness">LocalBusiness</option><option value="ProfessionalService">ProfessionalService</option><option value="Organization">Organization (fiziksel adres yok)</option>
              </select>
            </Field>
            <Field label="Telefon"><input name="phone" defaultValue={s.business.phone} placeholder="+90 …" className={inputCls} /></Field>
            <Field label="E-posta"><input name="email" defaultValue={s.business.email} className={inputCls} /></Field>
            <Field label="Açık adres"><input name="street" defaultValue={s.business.street} className={inputCls} /></Field>
            <Field label="İlçe"><input name="district" defaultValue={s.business.district} className={inputCls} /></Field>
            <Field label="İl"><input name="city" defaultValue={s.business.city} className={inputCls} /></Field>
            <Field label="Posta kodu"><input name="postalCode" defaultValue={s.business.postalCode} className={inputCls} /></Field>
            <Field label="Enlem / Boylam"><div className="flex gap-2"><input name="lat" defaultValue={s.business.lat ?? ""} className={inputCls} /><input name="lng" defaultValue={s.business.lng ?? ""} className={inputCls} /></div></Field>
            <Field label="Kuruluş yılı"><input name="foundingYear" defaultValue={s.business.foundingYear ?? ""} className={inputCls} /></Field>
            <Field label="Fiyat aralığı (isteğe bağlı)"><input name="priceRange" defaultValue={s.business.priceRange} placeholder="₺₺" className={inputCls} /></Field>
            <Field label="Hizmetler (virgülle)" className="sm:col-span-2"><input name="services" defaultValue={s.business.services.join(", ")} className={inputCls} /></Field>
            <fieldset className="sm:col-span-2">
              <legend className="text-[13px] font-medium">Çalışma saatleri</legend>
              {[0, 1, 2].map((i) => {
                const h = s.business.openingHours[i];
                return (
                  <div key={i} className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
                    {DAYS.map(([d, l]) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name={`h${i}_days`} value={d} defaultChecked={h?.days.includes(d as never)} />{l}</label>)}
                    <input name={`h${i}_opens`} defaultValue={h?.opens ?? ""} placeholder="09:00" className="w-20 rounded border border-line bg-paper px-2 py-1" />–
                    <input name={`h${i}_closes`} defaultValue={h?.closes ?? ""} placeholder="18:00" className="w-20 rounded border border-line bg-paper px-2 py-1" />
                  </div>
                );
              })}
            </fieldset>
            <div className="sm:col-span-2">{save}</div>
          </form>
        </Card>
      )}

      {tab === "entegrasyon" && (
        <div className="space-y-6">
          <Card title="Google Search Console (Google hesabıyla bağlan)">
            <div className="mb-4 text-[13px]" data-gsc-status>
              {oauth ? <Notice tone="ok">Bağlı{oauth.email ? `: ${oauth.email}` : ""} · {new Date(oauth.connectedAt).toLocaleString("tr-TR")} · Mülk: {s.integrations.gscProperty || "seçilmedi"} · Son veri günü: {lastDay ? lastDay.date.toISOString().slice(0, 10) : "henüz yok"} · Son senkron: {lastSync ? `${lastSync.startedAt.toLocaleString("tr-TR")} (${lastSync.status})` : "yok"}</Notice> : <Notice tone="warn">Bağlı değil — gerçek Google verisi alınamıyor.</Notice>}
            </div>
            <form action={saveGscOAuthAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="OAuth istemci kimliği (Client ID)" hint="Google Cloud Console → API'ler ve Hizmetler → Kimlik bilgileri → OAuth istemci kimliği (Web uygulaması). Search Console API etkin olmalı."><input name="gscClientId" defaultValue={s.integrations.gscClientId} placeholder="…apps.googleusercontent.com" className={inputCls} autoComplete="off" /></Field>
              <Field label="OAuth istemci sırrı (Client secret)" hint={clientSecretSaved ? "Kayıtlı (şifreli saklanır, gösterilmez). Değiştirmek için yenisini yazın." : "Kayıtlı değil."}><input name="gscClientSecret" type="password" className={inputCls} autoComplete="new-password" /></Field>
              <p className="text-xs text-muted sm:col-span-2">Yetkili yönlendirme URI&apos;si olarak Google&apos;a şunu ekleyin: <code className="rounded bg-paper px-1">{redirectUri()}</code></p>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button className="rounded-full border border-line px-4 py-2">OAuth bilgilerini kaydet</button>
                {/* Google izin ekranına tam sayfa yönlendirme gerekir (istemci tarafı Link değil) */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                {oauthCfg && <a href="/api/integrations/gsc/start" className="rounded-full bg-ink px-4 py-2 text-paper">{oauth ? "Yeniden bağlan" : "Google Search Console'u Bağla"}</a>}
              </div>
            </form>
            {oauth && (
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                {properties && (
                  <form action={selectGscPropertyAction} className="flex flex-wrap items-end gap-2">
                    <Field label="Mülk (property)" className="min-w-72 flex-1">
                      <select name="gscProperty" defaultValue={s.integrations.gscProperty} className={inputCls}>
                        <option value="">— seçin —</option>
                        {properties.map((p) => <option key={p.siteUrl} value={p.siteUrl}>{p.siteUrl} ({p.permissionLevel})</option>)}
                      </select>
                    </Field>
                    <button className="rounded-full bg-ink px-4 py-2 text-paper">Mülkü kaydet</button>
                  </form>
                )}
                {propertyError && <Notice tone="bad">Mülk listesi alınamadı: {propertyError}</Notice>}
                <form action={disconnectGscAction}><button className="rounded-full border border-bad px-4 py-2 text-bad">Bağlantıyı kes</button></form>
              </div>
            )}
          </Card>
          <Card title="Yapay zekâ (Anthropic Claude)">
            <form action={saveAnthropicAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Anthropic API anahtarı" hint={anthropicKey ? `Kayıtlı: ${maskKey(anthropicKey)} (şifreli saklanır). Değiştirmek için yenisini yazın.` : process.env.ANTHROPIC_API_KEY ? "Sunucu ortam değişkeninden okunuyor; panelden girilen anahtar önceliklidir." : "Kayıtlı değil — içerik üretimi ve yeni sayfa kapalı."}>
                <input name="anthropicKey" type="password" placeholder="sk-ant-…" className={inputCls} autoComplete="new-password" />
              </Field>
              <Field label="Model"><input name="aiModel" defaultValue={s.integrations.aiModel} className={inputCls} /></Field>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="aiEnabled" defaultChecked={s.integrations.aiProvider === "anthropic"} /> Yapay zekâ önerileri ve SEO ajanı içerik üretimi açık</label>
              {anthropicKey && <label className="flex items-center gap-2 text-[13px] text-bad"><input type="checkbox" name="removeAnthropic" /> Kayıtlı anahtarı sil</label>}
              <div className="sm:col-span-2"><button className="rounded-full bg-ink px-5 py-2 text-paper">Kaydet</button></div>
            </form>
            <form action={testAnthropicAction} className="mt-3"><button className="rounded-full border border-line px-4 py-2">Bağlantıyı test et</button></form>
          </Card>
          <Card title="Google Search Console — alternatif: servis hesabı">
            <form action={saveIntegrationsAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Mülk (property)" hint={`Alan adı mülkü: sc-domain:${siteHost()} · URL mülkü: ${siteUrl()}/`}><input name="gscProperty" defaultValue={s.integrations.gscProperty} className={inputCls} /></Field>
              <Field label="Doğrulama meta etiketi (isteğe bağlı)" hint="HTML etiketi yöntemi: google-site-verification içeriği veya etiketin tamamı. Ana sayfaya eklenir."><input name="gscVerification" defaultValue={s.integrations.gscVerification} className={inputCls} /></Field>
              <Field label="Servis hesabı JSON anahtarı" className="sm:col-span-2" hint={gscEmail ? `Kayıtlı: ${gscEmail} (şifreli saklanır, gösterilmez). Değiştirmek için yenisini yapıştırın.` : "Kayıtlı değil. Anahtar AES-256-GCM ile şifrelenerek saklanır."}>
                <textarea name="gscJson" rows={4} placeholder='{"type":"service_account", …}' className={`${inputCls} font-mono text-xs`} autoComplete="off" />
              </Field>
              {gscEmail && <label className="flex items-center gap-2 text-[13px] text-bad sm:col-span-2"><input type="checkbox" name="removeGsc" /> Kayıtlı anahtarı sil</label>}
              <Field label="Bing Webmaster doğrulaması (msvalidate.01)" hint="ChatGPT araması Bing dizinini kullanır; Bing Webmaster Tools'a siteyi ekleyin."><input name="bingVerification" defaultValue={s.integrations.bingVerification} className={inputCls} /></Field>
              <Field label="Yandex Webmaster doğrulaması"><input name="yandexVerification" defaultValue={s.integrations.yandexVerification} className={inputCls} /></Field>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="indexNow" defaultChecked={s.integrations.indexNow} /> IndexNow: sayfa yayınlanınca/güncellenince Bing, Yandex ve diğerlerine anında bildir <span className="text-xs text-muted">(anahtar: /indexnow-key.txt, yerel adreste gönderilmez)</span></label>
              <input type="hidden" name="gaId" value={s.integrations.gaId} /><input type="hidden" name="gtmId" value={s.integrations.gtmId} />
              <input type="hidden" name="aiProvider" value={s.integrations.aiProvider} /><input type="hidden" name="aiModel" value={s.integrations.aiModel} />
              <div className="sm:col-span-2">{save}</div>
            </form>
            {gscEmail && <form action={testGscAction} className="mt-3"><button className="rounded-full border border-line px-4 py-2">Bağlantıyı test et</button></form>}
          </Card>
          <Card title="Google Analytics / Tag Manager">
            <form action={saveIntegrationsAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="gscProperty" value={s.integrations.gscProperty} /><input type="hidden" name="gscVerification" value={s.integrations.gscVerification} />
              <input type="hidden" name="bingVerification" value={s.integrations.bingVerification} /><input type="hidden" name="yandexVerification" value={s.integrations.yandexVerification} />{s.integrations.indexNow && <input type="hidden" name="indexNow" value="on" />}
              <input type="hidden" name="aiProvider" value={s.integrations.aiProvider} /><input type="hidden" name="aiModel" value={s.integrations.aiModel} />
              <Field label="GA4 ölçüm kimliği" hint="G-XXXXXXX. GTM girilirse GA'yı GTM içinden yönetin."><input name="gaId" defaultValue={s.integrations.gaId} className={inputCls} /></Field>
              <Field label="GTM kapsayıcı kimliği"><input name="gtmId" defaultValue={s.integrations.gtmId} placeholder="GTM-XXXXXX" className={inputCls} /></Field>
              <p className="text-xs text-muted sm:col-span-2">Script&apos;ler sayfa yüklendikten sonra yüklenir (performans). Çerez onayı (KVKK) gereksinimini hukuk danışmanınızla değerlendirin.</p>
              <div className="sm:col-span-2">{save}</div>
            </form>
          </Card>
        </div>
      )}

      {tab === "robots" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Ek kurallar">
            <form action={saveRobotsAction} className="space-y-3">
              <textarea name="extraRules" defaultValue={s.robots.extraRules} rows={10} className={`${inputCls} font-mono text-xs`} placeholder={"User-agent: GPTBot\nDisallow: /"} />
              <p className="text-xs text-muted">Güvenlik: tüm siteyi veya yayındaki sayfaların önemli bir kısmını Google&apos;a kapatan kurallar (User-agent: * / Googlebot + Disallow: /) kaydedilmez. Sayfayı dizinden çıkarmak için robots.txt değil NOINDEX kullanın.</p>
              {save}
            </form>
          </Card>
          <Card title="Yayındaki robots.txt önizlemesi">
            <pre className="whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-xs">{buildRobotsTxt(siteUrl(), s.robots.extraRules)}</pre>
          </Card>
        </div>
      )}
      {tab === "eposta" && (
        <div className="space-y-6">
          <Card title="Haftalık SEO raporu ve alarmlar">
            <form action={saveEmailAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Alıcı e-posta"><input name="recipient" type="email" defaultValue={s.email.recipient} className={inputCls} /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={s.email.enabled} /> Haftalık rapor e-postası aktif</label>
              <Field label="Rapor günü"><select name="day" defaultValue={s.email.day} className={inputCls}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
              <Field label="Rapor saati (Türkiye saati)"><select name="hour" defaultValue={s.email.hour} className={inputCls}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></Field>
              <fieldset className="space-y-2 text-[13px] sm:col-span-2">
                <label className="flex items-center gap-2"><input type="checkbox" name="criticalAlarms" defaultChecked={s.email.criticalAlarms} /> Kritik alarm e-postaları <span className="text-xs text-muted">(tıklamada ciddi düşüş, indekslenebilirlik, sitemap, Search Console bağlantısı, tarayıcı hatası)</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" name="notifyRising" defaultChecked={s.email.notifyRising} /> Yükselen kelimeleri bildir</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="notifyFalling" defaultChecked={s.email.notifyFalling} /> Düşen kelimeleri bildir</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="dailyReport" defaultChecked={s.email.dailyReport} /> Günlük SEO ajanı raporu</label>
                <label className="flex items-center gap-2">Günlük rapor saati: <select name="dailyHour" defaultValue={s.email.dailyHour} className="rounded border border-line bg-paper px-2 py-1">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
              </fieldset>
              <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-[13px] font-medium">SMTP (gönderim sunucusu)</legend>
                <Field label="SMTP sunucusu" hint="Ör. smtp.gmail.com (Gmail için uygulama şifresi gerekir)"><input name="smtpHost" defaultValue={s.email.smtpHost} className={inputCls} /></Field>
                <Field label="Port"><input name="smtpPort" type="number" defaultValue={s.email.smtpPort} className={inputCls} /></Field>
                <Field label="Kullanıcı adı"><input name="smtpUser" defaultValue={s.email.smtpUser} className={inputCls} autoComplete="off" /></Field>
                <Field label="Şifre" hint={smtpSaved ? "Kayıtlı (şifreli saklanır, gösterilmez). Değiştirmek için yenisini yazın." : "Kayıtlı değil. AES-256-GCM ile şifrelenerek saklanır."}><input name="smtpPassword" type="password" className={inputCls} autoComplete="new-password" /></Field>
                <Field label="Gönderen e-postası (From Email)"><input name="smtpFrom" defaultValue={s.email.smtpFrom} placeholder={s.email.smtpUser || "rapor@alanadiniz.com"} className={inputCls} /></Field>
                <Field label="Şifreleme"><select name="smtpEncryption" defaultValue={smtpEncryptionOf(s.email)} className={inputCls}><option value="starttls">STARTTLS (genellikle 587)</option><option value="ssl">SSL/TLS (genellikle 465)</option><option value="none">Yok (önerilmez)</option></select></Field>
                <Field label="Gönderen adı (From Name)"><input name="smtpFromName" defaultValue={s.email.smtpFromName} placeholder={s.site.siteName} className={inputCls} /></Field>
                {smtpSaved && <label className="flex items-center gap-2 text-[13px] text-bad sm:col-span-2"><input type="checkbox" name="removeSmtp" /> Kayıtlı SMTP şifresini sil</label>}
              </fieldset>
              {!s.email.smtpHost && <div className="sm:col-span-2"><Notice tone="warn">SMTP tanımlı değil: raporlar üretilir ve Otopilot panelinde okunabilir, ancak e-posta gönderilemez.</Notice></div>}
              <div className="sm:col-span-2">{save}</div>
            </form>
            <form action={testEmailAction} className="mt-3 flex flex-wrap items-center gap-3">
              <button className="rounded-full border border-line px-4 py-2">Test raporu gönder</button>
              {lastMail && <span className="text-xs text-muted">Son e-posta: {lastMail.createdAt.toLocaleString("tr-TR")} · {lastMail.kind} · {lastMail.status}{lastMail.error ? ` — ${lastMail.error.slice(0, 120)}` : ""}</span>}
            </form>
          </Card>
        </div>
      )}

      {tab === "otopilot" && (
        <Card title="Otonom SEO motoru">
          <form action={saveAutopilotAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="SEO ajanı modu" className="sm:col-span-2" hint="OBSERVE: yalnızca ölçer ve raporlar · ASSIST: önerileri ve taslakları hazırlar, onayla uygulanır · AUTONOMOUS: güvenli SEO işlemlerini, doğrulanmış içerik iyileştirmelerini ve kalite kapısını geçen yeni sayfaları kendisi uygular/yayınlar.">
              <select name="mode" defaultValue={s.autopilot.enabled ? s.autopilot.mode : "ASSIST"} className={inputCls}>
                <option value="OBSERVE">OBSERVE — yalnızca ölç</option>
                <option value="ASSIST">ASSIST — önerileri hazırla</option>
                <option value="AUTONOMOUS">AUTONOMOUS — kendi kendine çalış</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="autoApplySafe" defaultChecked={s.autopilot.autoApplySafe} /> Güvenli işlemleri otomatik uygula <span className="text-xs text-muted">(title, meta description, iç link, kırık link)</span></label>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="autoApplyControlled" defaultChecked={s.autopilot.autoApplyControlled} /> Kontrollü içerik genişletmeyi otomatik uygula <span className="text-xs text-muted">(yalnızca yapay zekâ anahtarı varken, sayfadaki bilgilerle, en çok %40 büyüme; aksi hâlde onaya düşer)</span></label>
            <Field label="Haftalık en çok otomatik değişiklik"><input name="maxChangesPerWeek" type="number" min={0} max={50} defaultValue={s.autopilot.maxChangesPerWeek} className={inputCls} /></Field>
            <Field label="Haftalık en çok yeni sayfa" hint="Ölçekli içerik (doorway) koruması; sayfa yalnızca gerçek talep + kalite kapısı ile açılır"><input name="maxNewPagesPerWeek" type="number" min={0} max={10} defaultValue={s.autopilot.maxNewPagesPerWeek} className={inputCls} /></Field>
            <p className="text-xs text-muted sm:col-span-2">Yeni sayfa yayını, büyük içerik değişikliği, yönlendirme, silme, canonical, NOINDEX ve URL değişikliği her zaman insan onayı gerektirir. Her otomatik değişiklik sürüm geçmişine yazılır ve geri alınabilir.</p>
            <div className="sm:col-span-2">{save}</div>
          </form>
        </Card>
      )}
    </>
  );
}
