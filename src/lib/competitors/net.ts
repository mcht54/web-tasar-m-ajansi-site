import "server-only";
// SSRF KORUMALI HTTP İSTEMCİSİ (yalnızca rakip taraması için).
// - Yalnızca http/https ve 80/443 portları.
// - Ad çözümleme BAĞLANTI ANINDA denetlenir (özel `lookup`): localhost, özel ağlar,
//   link-local/bulut metadata (169.254.0.0/16), CGNAT, çoklu yayın, IPv6 ULA/link-local ve
//   IPv4-eşlenmiş adresler reddedilir. DNS rebinding bu yüzden işe yaramaz.
// - Her yönlendirme adımı yeniden denetlenir; en çok 5 adım.
// - Zaman aşımı ve yanıt boyutu sınırı; sıkıştırılmış yanıt açılır.

import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

export const CRAWLER_UA = "Mozilla/5.0 (compatible; WTA-Competitor-Crawler/1.0; +https://webtasarimajansi.net)";
export const ROBOTS_UA_TOKEN = "wta-competitor-crawler";

/** Yalnızca testler: adı verilen yerel test sunucusuna izin (üretimde hiçbir yerden verilmez).
 *  Toptan "özel ağa izin" yoktur: yönlendirme başka bir iç adrese giderse yine engellenir. */
export type NetPolicy = { allowHosts?: string[] };
const allowed = (policy: NetPolicy, host: string) => Boolean(policy.allowHosts?.includes(host));

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const toInt = (ip: string) => ip.split(".").reduce((s, o) => (s << 8) + Number(o), 0) >>> 0;

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = toInt(ip);
    return V4_BLOCKS.some(([b, bits]) => (n >>> (32 - bits)) === (toInt(b) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isBlockedIp(mapped[1]);
    if (v === "::" || v === "::1") return true;
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 çoklu yayın
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:") || v.startsWith("100::")) return true;
    return false;
  }
  return true; // tanınmayan biçim
}

const BLOCKED_HOSTS = /^(localhost|metadata|metadata\.google\.internal)$|\.(localhost|local|internal|intranet|lan|home|corp)$/i;

/** Rakip alan adı: yalnızca herkese açık, IP olmayan, en az iki etiketli alan adı. */
export function validateDomain(input: string): string {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  if (!s) throw new Error("Alan adı girin (ör. ornek.com)");
  if (net.isIP(s) || /^\[.*\]$/.test(s)) throw new Error("IP adresi kabul edilmez; alan adı girin");
  if (BLOCKED_HOSTS.test(s)) throw new Error("Yerel/iç ağ alan adı kabul edilmez");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) throw new Error("Geçerli bir alan adı girin (ör. ornek.com)");
  return s;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(policy: NetPolicy) {
  return (hostname: string, options: dns.LookupOptions, cb: LookupCb) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return cb(err, "");
      const list = addresses as dns.LookupAddress[];
      const bad = list.find((a) => isBlockedIp(a.address));
      if (bad && !allowed(policy, hostname)) {
        const e = new Error(`SSRF koruması: ${hostname} → ${bad.address} (özel/iç ağ adresi) engellendi`) as NodeJS.ErrnoException;
        e.code = "ESSRF";
        return cb(e, "");
      }
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

export type SafeResponse = { status: number; headers: Record<string, string>; body: string; finalUrl: string; chain: { url: string; status: number }[]; truncated: boolean; ms: number };

export async function checkUrl(raw: string, policy: NetPolicy): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Geçersiz URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`İzin verilmeyen şema: ${u.protocol}`);
  if (u.username || u.password) throw new Error("Kimlik bilgisi içeren URL kabul edilmez");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!allowed(policy, host) && u.port && u.port !== "80" && u.port !== "443") throw new Error(`İzin verilmeyen port: ${u.port}`);
  if (!allowed(policy, host) && (BLOCKED_HOSTS.test(host) || (net.isIP(host) && isBlockedIp(host)))) throw new Error(`SSRF koruması: ${host} engellendi`);
  return u;
}

function once(url: URL, o: { method: string; headers: Record<string, string>; timeoutMs: number; maxBytes: number; policy: NetPolicy }): Promise<{ status: number; headers: Record<string, string>; body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, { method: o.method, headers: o.headers, lookup: guardedLookup(o.policy) as never, timeout: o.timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      let settled = false;
      const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const stream = enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : res;
      // Sonuç tek kez ve yalnızca (açılmış) akış bittiğinde döner. Ham bağlantının "close"
      // olayı sıkıştırılmış yanıtta açma bitmeden gelebilir → gövde boş kalırdı.
      const done = () => {
        if (settled) return;
        settled = true;
        resolve({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")])), body: Buffer.concat(chunks), truncated });
      };
      stream.on("data", (c: Buffer) => {
        if (truncated) return;
        size += c.length;
        if (size > o.maxBytes) {
          truncated = true;
          res.destroy();
          done();
          return;
        }
        chunks.push(c);
      });
      stream.on("end", done);
      if (stream === res) res.on("close", done); // sıkıştırmasız: bağlantı erken kapanırsa eldekiyle dön
      else stream.on("close", done);
      stream.on("error", (e) => (truncated ? done() : !settled && (settled = true, reject(e))));
    });
    req.on("timeout", () => req.destroy(new Error(`Zaman aşımı (${o.timeoutMs} ms)`)));
    req.on("error", reject);
    req.end();
  });
}

/** SSRF korumalı GET/HEAD; yönlendirmeleri elle ve denetleyerek izler. */
export async function safeFetch(raw: string, opts: { policy?: NetPolicy; timeoutMs?: number; maxBytes?: number; method?: "GET" | "HEAD"; headers?: Record<string, string> } = {}): Promise<SafeResponse> {
  const policy = opts.policy ?? {};
  const t0 = Date.now();
  const chain: { url: string; status: number }[] = [];
  let url = await checkUrl(raw, policy);
  for (let hop = 0; hop < 6; hop++) {
    const r = await once(url, {
      method: opts.method ?? "GET", timeoutMs: opts.timeoutMs ?? 10_000, maxBytes: opts.maxBytes ?? 2_000_000, policy,
      headers: { "user-agent": CRAWLER_UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5", "accept-encoding": "gzip, deflate, br", ...(opts.headers ?? {}) },
    });
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && r.status !== 304 && loc) {
      chain.push({ url: url.toString(), status: r.status });
      url = await checkUrl(new URL(loc, url).toString(), policy);
      continue;
    }
    return { status: r.status, headers: r.headers, body: r.body.toString("utf8"), finalUrl: url.toString(), chain, truncated: r.truncated, ms: Date.now() - t0 };
  }
  throw new Error("Çok fazla yönlendirme");
}
