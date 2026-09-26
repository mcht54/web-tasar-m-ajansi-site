// Production dağıtım kitinin yalıtım güvenceleri (statik denetim): aynı VPS'deki başka
// bir projenin (ör. pazar) kaynaklarına referans yok; DB/Redis portu açılmıyor;
// Nginx yalnızca bu alan adı için ve sunucudaki Nginx 1.24 ile uyumlu.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const compose = readFileSync("deploy/docker-compose.yml", "utf8");
const nginx = readFileSync("deploy/nginx/webtasarimajansi.net.conf", "utf8");
const scripts = [...readdirSync("deploy").filter((f) => f.endsWith(".sh")).map((f) => [f, readFileSync(`deploy/${f}`, "utf8")] as const), ["scripts/deploy.sh", readFileSync("scripts/deploy.sh", "utf8")] as const];
const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

describe("docker compose yalıtımı", () => {
  it("proje adı, container, network ve volume adları yalnızca bu projeye ait", () => {
    expect(compose).toMatch(/^name: webtasarimajansi$/m);
    for (const m of compose.matchAll(/container_name: (\S+)/g)) expect(m[1]).toMatch(/^webtasarimajansi-/);
    const nets = [...compose.matchAll(/^\s{4}name: (\S+)$/gm)].map((m) => m[1]);
    expect(nets.length).toBeGreaterThanOrEqual(4);
    for (const n of nets) expect(n).toMatch(/^webtasarimajansi[-_]/);
    expect(compose).not.toMatch(/external:\s*true/); // başka projenin ağına/volume'üne bağlanmaz
    expect(compose.toLowerCase()).not.toContain("pazar");
  });
  it("veritabanı hiçbir host portuna açılmaz; web yalnızca 127.0.0.1'e açılır; DB ağı internete kapalı", () => {
    const ports = [...compose.matchAll(/^\s+- "([^"]+:\d+)"$/gm)].map((m) => m[1]);
    expect(ports).toEqual(["127.0.0.1:${WEB_PORT:-3400}:3300"]);
    expect(compose).not.toMatch(/5432:5432|6379/);
    expect(compose).toMatch(/webtasarimajansi-db-network:\n\s+name: webtasarimajansi-db-network\n\s+internal: true/);
    const db = compose.split(/\n  (?=\w)/).find((b) => b.startsWith("db:"))!;
    expect(db).toContain("networks: [webtasarimajansi-db-network]");
  });
  it("ayrı worker ve scheduler konteynerleri, yeniden başlatma politikası ve kaynak sınırları", () => {
    for (const svc of ["web", "worker", "scheduler", "db"]) {
      const block = compose.split(/\n  (?=\w)/).find((b) => b.startsWith(`${svc}:`))!;
      expect(block, svc).toContain("restart: unless-stopped");
      expect(block, svc).toMatch(/mem_limit: \d+[mg]/);
    }
    expect(compose).toContain("WORKER_ROLE: worker");
    expect(compose).toContain("WORKER_ROLE: scheduler");
    expect(compose).toMatch(/AUTOPILOT_SCHEDULER: "off"/); // web içinde ikinci zamanlayıcı yok
  });
});

describe("nginx", () => {
  it("yalnızca webtasarimajansi.net server block'ları; kendi sertifikası; Nginx 1.24 uyumlu", () => {
    const names = [...nginx.matchAll(/server_name ([^;]+);/g)].flatMap((m) => m[1].split(/\s+/));
    expect(new Set(names)).toEqual(new Set(["webtasarimajansi.net", "www.webtasarimajansi.net"]));
    expect(nginx).not.toMatch(/http2 on;/); // 1.25.1+ yönergesi
    expect(nginx).toContain("listen 443 ssl http2;");
    for (const m of nginx.matchAll(/ssl_certificate(?:_key)? ([^;]+);/g)) expect(m[1]).toContain("/etc/letsencrypt/live/webtasarimajansi.net/");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3400;");
    expect(nginx).not.toMatch(/default_server/);
    expect(nginx.toLowerCase()).not.toContain("pazar");
  });
});

describe("dağıtım betikleri", () => {
  it("başka projenin dizinine, .env'ine veya compose'una dokunmaz; nginx -t olmadan reload etmez", () => {
    for (const [f, s] of scripts) {
      expect(s, f).not.toMatch(/\/opt\/mcht\/pazar/);
      expect(s, f).not.toMatch(/docker (rm|stop|restart|volume rm|network rm)\b/);
      expect(s, f).not.toMatch(/docker compose (down|rm)/);
    }
    const ng = scripts.find(([f]) => f === "install-nginx.sh")![1];
    expect(ng.indexOf("nginx -t")).toBeLessThan(ng.indexOf("systemctl reload nginx"));
    expect(ng).toContain("certbot certonly --webroot"); // --nginx eklentisi başka blokları düzenleyebilir
    expect(scripts.find(([f]) => f === "deploy.sh")![1]).toContain("scripts/deploy.sh"); // tek dağıtım yolu
    const dep = scripts.find(([f]) => f === "scripts/deploy.sh")![1];
    expect(dep).toContain("snapshot >"); // öncesi/sonrası karşılaştırma
    expect(dep).toMatch(/diff -u .*others-before.*others-after/);
    expect(dep.indexOf("backup.sh")).toBeLessThan(dep.indexOf("run --rm migrate")); // migration'dan ÖNCE yedek
  });
  it(".env ve sunucu dosyaları git'e ve imaja girmez", () => {
    const gi = readFileSync(".gitignore", "utf8");
    for (const x of ["/.env.production", "/.build", "/backups", "/deploy/snapshots"]) expect(gi).toContain(x);
    const di = readFileSync(".dockerignore", "utf8");
    for (const x of [".env", ".env.*", "backups"]) expect(di.split("\n")).toContain(x);
    expect(readFileSync("deploy/Dockerfile.tools.dockerignore", "utf8").split("\n")).toContain(".build");
  });
});

describe("scripts/deploy.sh güvenliği", () => {
  const dep = readFileSync("scripts/deploy.sh", "utf8");
  const code = dep.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  it("kilit, kök dizin koruması, yalnızca bu projenin compose dosyası", () => {
    expect(code).toContain('flock -n 9');
    expect(code).toMatch(/case "\$ROOT" in \*\/webtasarimajansi\)/);
    expect(code).toContain('COMPOSE=(docker compose -p "$PROJECT" -f "$ROOT/deploy/docker-compose.yml" --env-file "$ROOT/.env")');
    // Çalıştırılan her "docker compose" bu projenin -p/-f/--env-file tanımıyla (COMPOSE dizisi) olmalı
    for (const m of code.matchAll(/docker compose (?!version|ls|v2)/g)) expect(code.slice(m.index!, m.index! + 40)).toContain("docker compose -p");
  });
  it("veri silen/genel komut yok; .env Git'ten gelmez", () => {
    for (const bad of [/docker compose[^\n]*\bdown\b/, /down -v/, /volume rm/, /volume prune/, /system prune/, /git clean/, /rm -rf [^\n]*(backups|postgres|volumes)/]) expect(code).not.toMatch(bad);
    expect(code).toMatch(/\[ -f \.env \] \|\| \{ echo "Production \.env yok/);
  });
  it("sağlık kontrolü başarısızsa önceki imajlara ve koda döner; DB'ye geri dönüş uygulamaz", () => {
    expect(code).toMatch(/docker image tag "\$PROJECT-web:latest" "\$PROJECT-web:previous"/);
    expect(code).toMatch(/docker image tag "\$PROJECT-web:previous" "\$PROJECT-web:latest"/);
    expect(code).toContain('git reset -q --hard "$PREV_SHA"');
    for (const p of ["/health", "/sitemap.xml", "/robots.txt"]) expect(code).toContain(p);
    expect(code).toMatch(/RestartCount/); // crash loop tespiti
    expect(code).not.toMatch(/migrate (reset|down)|prisma migrate dev/);
  });
});

describe("GitHub Actions iş akışı", () => {
  it("dağıtım yalnızca main'e push'ta ve testler geçerse; eşzamanlı dağıtım yok", () => {
    expect(workflow).toMatch(/deploy:\n[\s\S]*needs: test/);
    expect(workflow).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.DEPLOY_ENABLED == 'true'");
    expect(workflow).toMatch(/group: webtasarimajansi-production-deploy\n\s+cancel-in-progress: false/);
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "deploy/Dockerfile.tools", "deploy/Dockerfile.web"]) expect(workflow).toContain(step);
  });
  it("sırlar yalnızca GitHub Secrets'tan; sunucu parmak izi zorunlu; anahtar iş sonunda silinir", () => {
    for (const s of ["secrets.VPS_HOST", "secrets.VPS_USER", "secrets.VPS_SSH_KEY", "secrets.VPS_KNOWN_HOSTS"]) expect(workflow).toContain(s);
    expect(workflow).toContain("StrictHostKeyChecking=yes");
    expect(workflow).not.toMatch(/ssh-keyscan [^"\n]*>>?\s*~\/\.ssh\/known_hosts/);
    expect(workflow).toMatch(/if: always\(\)\n\s+run: rm -f ~\/\.ssh\/deploy_key/);
    const wfCode = workflow.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(wfCode).not.toMatch(/ANTHROPIC|SMTP_PASS|GSC_|sk-ant/i); // uygulama sırları GitHub'a taşınmaz
    expect(workflow).not.toMatch(/down -v|volume rm/);
    expect(workflow).toContain("permissions:\n  contents: read");
  });
});
