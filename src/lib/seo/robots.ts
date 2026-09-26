// robots.txt üretimi ve güvenlik kontrolü. Yönetici ek kural yazabilir ama
// sitenin tamamını (veya yayındaki önemli sayfaları) engelleyen kurallar kaydedilemez.

export const FIXED_DISALLOW = ["/yonetim", "/api/"];

export type RobotsCheck = { errors: string[]; warnings: string[] };

type Group = { agents: string[]; disallow: string[] };

function parse(rules: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of rules.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === "disallow" && cur) cur.disallow.push(val);
    }
  }
  return groups;
}

/** Robots joker karakterli kuralı bir yolla eşleştirir (* ve $ desteği). */
export function robotsMatch(rule: string, path: string): boolean {
  if (!rule) return false;
  let r = rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&");
  const anchored = r.endsWith("$");
  if (anchored) r = r.slice(0, -1);
  r = r.replace(/\$/g, "\\$").replace(/\*/g, ".*");
  return new RegExp(`^${r}${anchored ? "$" : ""}`).test(path);
}

export function checkRobotsRules(rules: string, importantPaths: string[]): RobotsCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const known = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay"]);
  for (const raw of rules.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const key = line.split(":")[0].trim().toLowerCase();
    if (!line.includes(":") || !known.has(key)) errors.push(`Anlaşılamayan satır: "${line}"`);
  }
  for (const g of parse(rules)) {
    const critical = g.agents.some((a) => a === "*" || a.startsWith("googlebot"));
    for (const d of g.disallow) {
      if (critical && (d === "/" || d === "/*" || d === "*")) {
        errors.push(`"Disallow: ${d}" sitenin tamamını Google'a kapatır; bu kural kaydedilemez.`);
        continue;
      }
      const hit = importantPaths.filter((p) => robotsMatch(d, p));
      if (critical && hit.length) {
        const sample = hit.slice(0, 3).join(", ");
        if (hit.includes("/") || hit.length >= Math.max(5, importantPaths.length * 0.2))
          errors.push(`"Disallow: ${d}" yayındaki ${hit.length} sayfayı engelliyor (${sample}…); kaydedilemez.`);
        else warnings.push(`"Disallow: ${d}" yayındaki ${hit.length} sayfayı engelliyor: ${sample}`);
      }
    }
  }
  return { errors, warnings };
}

/** Yanıt/arama motoru botları: kullanıcıya kaynak linkiyle öneri sunar. */
export const AI_SEARCH_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User", "DuckAssistBot"];
/** Model eğitimi için tarayan botlar. */
export const AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "meta-externalagent", "Amazonbot"];

export function buildRobotsTxt(
  base: string,
  extraRules: string,
  ai: { search: boolean; training: boolean } = { search: true, training: true },
): string {
  const fixed = FIXED_DISALLOW.map((d) => `Disallow: ${d}`);
  const lines = ["User-agent: *", "Allow: /", ...fixed, ""];
  // Belirli bir bot için grup yazılınca "*" grubu o bota uygulanmaz; sabit kurallar tekrarlanır.
  const group = (bots: string[], allow: boolean, note: string) => [
    `# ${note}`,
    ...bots.map((b) => `User-agent: ${b}`),
    ...(allow ? ["Allow: /", ...fixed] : ["Disallow: /"]),
    "",
  ];
  lines.push(...group(AI_SEARCH_BOTS, ai.search, "Yapay zekâ arama/yanıt botları"));
  lines.push(...group(AI_TRAINING_BOTS, ai.training, "Yapay zekâ eğitim botları"));
  const extra = extraRules.trim();
  return [...lines, ...(extra ? [extra, ""] : []), `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}

/**
 * robots.txt'yi bir bot ve yol için değerlendirir (RFC 9309): bota özel grup
 * varsa o, yoksa "*" grubu; en uzun eşleşen kural kazanır, eşitlikte Allow.
 */
export function robotsAllows(txt: string, userAgent: string, path: string): { allowed: boolean; rule: string | null; group: string } {
  type G = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: G[] = [];
  let cur: G | null = null;
  let lastAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastAgent = true;
    } else {
      lastAgent = false;
      if (cur && (key === "allow" || key === "disallow") && val) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => robotsMatch(r.path, path));
  if (!rules.length) return { allowed: true, rule: null, group: specific.length ? userAgent : "*" };
  rules.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  const r = rules[0];
  return { allowed: r.allow, rule: `${r.allow ? "Allow" : "Disallow"}: ${r.path}`, group: specific.length ? userAgent : "*" };
}

export const AI_ENGINES: { engine: string; bot: string; purpose: string }[] = [
  { engine: "ChatGPT", bot: "OAI-SearchBot", purpose: "ChatGPT arama sonuçlarında kaynak gösterme" },
  { engine: "ChatGPT", bot: "ChatGPT-User", purpose: "Kullanıcı isteğiyle sayfayı açma" },
  { engine: "ChatGPT", bot: "GPTBot", purpose: "Model eğitimi" },
  { engine: "Perplexity", bot: "PerplexityBot", purpose: "Perplexity arama dizini" },
  { engine: "Perplexity", bot: "Perplexity-User", purpose: "Kullanıcı isteğiyle sayfayı açma" },
  { engine: "Claude", bot: "Claude-SearchBot", purpose: "Claude arama sonuçları" },
  { engine: "Claude", bot: "Claude-User", purpose: "Kullanıcı isteğiyle sayfayı açma" },
  { engine: "Claude", bot: "ClaudeBot", purpose: "Model eğitimi" },
  { engine: "Gemini / Google", bot: "Googlebot", purpose: "Google Arama, AI Overviews ve AI Mode" },
  { engine: "Gemini / Google", bot: "Google-Extended", purpose: "Gemini modellerinin eğitimi ve grounding kullanımı" },
  { engine: "Copilot / Bing", bot: "Bingbot", purpose: "Bing arama ve Copilot yanıtları" },
];
