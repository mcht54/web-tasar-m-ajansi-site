import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getSettingsFresh } from "@/lib/settings";
import { siteUrl } from "@/lib/env";
import { AI_ENGINES, buildRobotsTxt, robotsAllows } from "@/lib/seo/robots";
import { buildLlmsFullTxt, buildLlmsTxt } from "@/lib/seo/llms";
import { indexableEntries } from "@/lib/seo/sitemap";
import { loadSiteState } from "@/lib/seo/analyzer";
import { unverifiedCount, parseFaq } from "@/lib/seo/analyzer-shared";
import { Badge, Card, PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "AI Görünürlüğü" };

type Check = { label: string; ok: boolean; note: string };

export default async function AiVisibility() {
  await requireUser("seo");
  const [s, llms, full, entries, state] = await Promise.all([getSettingsFresh(), buildLlmsTxt(), buildLlmsFullTxt(), indexableEntries(), loadSiteState()]);
  const base = siteUrl();
  const robots = buildRobotsTxt(base, s.robots.extraRules, { search: s.seo.aiSearchBots, training: s.seo.aiTrainingBots });
  const indexable = new Set(entries.map((e) => (e.path === "/" ? `${base}/` : base + e.path)));
  const llmsUrls = [...llms.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/llms-full\.txt|sitemap\.xml/.test(u));
  const b = s.business;
  const checks: Check[] = [
    { label: "llms.txt yalnızca indekslenebilir sayfaları listeliyor", ok: llmsUrls.every((u) => indexable.has(u)), note: `${llmsUrls.length} bağlantı; indekslenebilir olmayan: ${llmsUrls.filter((u) => !indexable.has(u)).join(", ") || "yok"}` },
    { label: "Tüm indekslenebilir sayfalar llms.txt'de", ok: [...indexable].filter((u) => u !== `${base}/`).every((u) => llmsUrls.includes(u)), note: `${indexable.size} indekslenebilir URL` },
    { label: "Doğrulanmamış içerik yok ([DOĞRULANMALI])", ok: unverifiedCount(llms, full) === 0, note: `${unverifiedCount(llms, full)} işaret` },
    { label: "İletişim bilgisi ayarlarla tutarlı", ok: (!b.phone || llms.includes(b.phone)) && (!(b.email || s.site.email) || llms.includes(b.email || s.site.email)), note: [b.phone, b.email || s.site.email].filter(Boolean).join(" · ") || "Girilmemiş" },
    { label: "İşletme adı girilmiş (kurum kimliği)", ok: Boolean(b.name), note: b.name || "Ayarlar > İşletme'den girin; girilene kadar site adı kullanılır" },
    { label: "Adres girilmiş (yerel güven sinyali)", ok: Boolean(b.street && b.city), note: b.street ? `${b.street}, ${b.city}` : "Girilmemiş — uydurulmaz" },
    { label: "llms-full.txt dolu ve kaynak URL'li", ok: full.length > 1000 && full.includes("URL: "), note: `${Math.round(full.length / 1024)} KB` },
  ];
  const published = state.pages.filter((p) => p.status === "PUBLISHED" && p.robotsIndex && !p.autoNoindex);
  const readiness = published.map((p) => {
    const faq = parseFaq(p.faq).length;
    const introWords = (p.intro ?? "").split(/\s+/).filter(Boolean).length;
    return { path: p.path, faq, answerFirst: introWords > 0 && introWords <= 70, keywordInIntro: Boolean(p.primaryKeyword && (p.intro ?? "").toLocaleLowerCase("tr-TR").includes(p.primaryKeyword.split(" ")[0].toLocaleLowerCase("tr-TR"))), meta: Boolean(p.metaDescription) };
  });
  return (
    <>
      <PageTitle title="AI Görünürlüğü" desc="Yapay zekâ motorlarının siteye erişimi ve alıntılanabilir içerik durumu. Buradaki izinler yayındaki robots.txt'nin gerçek ayrıştırmasıdır. AI yanıtlarında görünme sonucu ölçülemez; yalnızca erişim ve içerik hazırlığı denetlenir." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="AI crawler izinleri (robots.txt, “/” için)" actions={<Link href="/yonetim/ayarlar?sekme=seo" className="text-xs underline">Ayarlar</Link>}>
          <Table head={["Motor", "Bot", "Amaç", "Durum", "Kural"]}>
            {AI_ENGINES.map((e) => {
              const r = robotsAllows(robots, e.bot, "/");
              return <tr key={e.bot}><td>{e.engine}</td><td className="font-mono text-xs">{e.bot}</td><td className="text-xs">{e.purpose}</td><td><Badge tone={r.allowed ? "ok" : "bad"}>{r.allowed ? "İzinli" : "Engelli"}</Badge></td><td className="font-mono text-xs">{r.group} · {r.rule ?? "kural yok (izinli)"}</td></tr>;
            })}
          </Table>
          <p className="mt-2 text-xs text-muted">/yonetim ve /api tüm botlara kapalıdır.</p>
        </Card>
        <Card title="llms.txt / llms-full.txt denetimi" actions={<div className="flex gap-3 text-xs"><a href="/llms.txt" target="_blank" className="underline">llms.txt</a><a href="/llms-full.txt" target="_blank" className="underline">llms-full.txt</a></div>}>
          <ul className="space-y-1.5 text-[13px]">
            {checks.map((c) => <li key={c.label} className="flex gap-2"><span className={`w-12 shrink-0 font-mono text-xs font-semibold ${c.ok ? "text-ok" : "text-bad"}`}>{c.ok ? "PASS" : "FAIL"}</span><span><b>{c.label}</b> <span className="text-muted">— {c.note}</span></span></li>)}
          </ul>
        </Card>
        <Card title="AI içerik hazırlığı (yayındaki indekslenebilir sayfalar)">
          <Table head={["Sayfa", "Kısa yanıt girişi (≤70 kelime)", "Ana kelime girişte", "Meta", "SSS"]}>
            {readiness.map((r) => (
              <tr key={r.path}><td>{r.path}</td><td>{r.answerFirst ? "✓" : "—"}</td><td>{r.keywordInIntro ? "✓" : "—"}</td><td>{r.meta ? "✓" : "—"}</td><td>{r.faq || "—"}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="llms.txt önizleme">
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-xs">{llms}</pre>
        </Card>
      </div>
    </>
  );
}
