// Panelden yönetilen entegrasyonlar: Google Search Console OAuth, Anthropic anahtarı,
// SMTP şifrelemesi ve sistem sağlık kontrolü. Sırlar veritabanında şifreli durur,
// hiçbir çıktıda düz metin görünmez.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteSecret, getSettingsFresh, saveSetting, setSecret } from "@/lib/settings";
import { checkState, disconnect, exchangeCode, GSC_CLIENT_SECRET, GSC_OAUTH_SECRET, makeState, oauthConnection, redirectUri } from "@/lib/gsc/oauth";
import { gscClient, gscConnected } from "@/lib/gsc/sync";
import { ANTHROPIC_SECRET, cachedAiKey, loadAiKey, maskKey } from "@/lib/ai/key";
import { claudeAvailable } from "@/lib/ai/claude";
import { smtpEncryptionOf, emailSchema } from "@/lib/settings-schema";
import { systemHealth } from "@/lib/health-check";
import { HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER } from "@/lib/autopilot/daily";

const FAKE_KEY = "sk-ant-TESTKEY-bu-gercek-bir-anahtar-degil-0123"; // gerçek anahtar biçimine uymaz (push protection)

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await saveSetting("integrations", { gscClientId: "123-test.apps.googleusercontent.com", gscProperty: "sc-domain:webtasarimajansi.net" });
  await setSecret(GSC_CLIENT_SECRET, "client-secret-test");
});

afterAll(async () => {
  for (const k of [GSC_OAUTH_SECRET, GSC_CLIENT_SECRET, ANTHROPIC_SECRET]) await deleteSecret(k);
  await saveSetting("integrations", {});
  await db.alarmState.deleteMany({ where: { key: { in: [HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER] } } });
});

describe("Google Search Console OAuth", () => {
  it("state CSRF koruması: kullanıcıya bağlı, süreli, değiştirilemez", () => {
    const s = makeState("u1");
    expect(checkState(s, "u1")).toBe(true);
    expect(checkState(s, "u2")).toBe(false);
    expect(checkState(s.replace(/.$/, (c) => (c === "a" ? "b" : "a")), "u1")).toBe(false);
    expect(checkState(makeState("u1", Date.now() - 20 * 60_000), "u1")).toBe(false);
    expect(checkState(null, "u1")).toBe(false);
    expect(redirectUri()).toBe("https://webtasarimajansi.net/api/integrations/gsc/callback");
  });

  it("kod → yenileme token'ı şifreli saklanır; istemci OAuth erişim token'ıyla çağrı yapar; bağlantı kesilince iptal edilir", async () => {
    const calls: { url: string; body?: string; auth?: string | null }[] = [];
    const idToken = `x.${Buffer.from(JSON.stringify({ email: "sahip@example.com" })).toString("base64url")}.y`;
    const fake = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? String(init.body) : undefined, auth: new Headers(init?.headers).get("authorization") });
      if (u.includes("oauth2.googleapis.com/token") && String(init?.body).includes("authorization_code")) return Response.json({ refresh_token: "1//refresh-TEST", access_token: "a", id_token: idToken, expires_in: 3600 });
      if (u.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "oauth-access-TEST", expires_in: 3600 });
      if (u.includes("/webmasters/v3/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:webtasarimajansi.net", permissionLevel: "siteOwner" }] });
      if (u.includes("revoke")) return new Response("", { status: 200 });
      return new Response("?", { status: 404 });
    }) as typeof fetch;
    const conn = await exchangeCode("kod-123", fake);
    expect(conn.email).toBe("sahip@example.com");
    const tokenCall = calls.find((c) => c.body?.includes("authorization_code"))!;
    expect(tokenCall.body).toContain(encodeURIComponent(redirectUri()));
    const row = await db.secret.findUniqueOrThrow({ where: { key: GSC_OAUTH_SECRET } });
    expect(JSON.stringify(row)).not.toContain("refresh-TEST"); // şifreli
    expect((await oauthConnection())!.refreshToken).toBe("1//refresh-TEST");
    expect(await gscConnected()).toBe(true);
    const client = (await gscClient(fake))!;
    const sites = await client.listSites();
    expect(sites[0].siteUrl).toBe("sc-domain:webtasarimajansi.net");
    expect(calls.find((c) => c.url.includes("/webmasters/v3/sites"))!.auth).toBe("Bearer oauth-access-TEST");
    await disconnect(fake);
    expect(calls.some((c) => c.url.includes("revoke"))).toBe(true);
    expect(await oauthConnection()).toBeNull();
    expect(await gscConnected()).toBe(false);
  });
});

describe("Anthropic API anahtarı (panelden)", () => {
  it("şifreli saklanır, maskelenir, süreçler arası önbellekle okunur, silinince devre dışı kalır", async () => {
    await setSecret(ANTHROPIC_SECRET, FAKE_KEY);
    const row = await db.secret.findUniqueOrThrow({ where: { key: ANTHROPIC_SECRET } });
    expect(JSON.stringify(row)).not.toContain("TESTKEY");
    expect(await loadAiKey(true)).toBe(FAKE_KEY);
    expect(cachedAiKey()).toBe(FAKE_KEY);
    expect(claudeAvailable()).toBe(true);
    expect(maskKey(FAKE_KEY)).toBe("sk-ant-…0123");
    expect(maskKey(FAKE_KEY)).not.toContain("TESTKEY");
    await deleteSecret(ANTHROPIC_SECRET);
    await loadAiKey(true);
    expect(claudeAvailable()).toBe(false);
  });
});

describe("SMTP şifrelemesi", () => {
  it("eski ayarlarla uyumlu: smtpSecure=true → SSL; varsayılan STARTTLS; açık seçim önceliklidir", () => {
    expect(smtpEncryptionOf(emailSchema.parse({ smtpSecure: true }))).toBe("ssl");
    expect(smtpEncryptionOf(emailSchema.parse({}))).toBe("starttls");
    expect(smtpEncryptionOf(emailSchema.parse({ smtpSecure: true, smtpEncryption: "none" }))).toBe("none");
  });
});

describe("sistem sağlık kontrolü (/health)", () => {
  it("web + veritabanı kritik; worker/scheduler sinyali yoksa 'degraded'; sır sızdırmaz", async () => {
    await db.alarmState.deleteMany({ where: { key: { in: [HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER] } } });
    await setSecret(ANTHROPIC_SECRET, FAKE_KEY);
    const a = await systemHealth();
    expect(a.checks.database.status).toBe("ok");
    expect(a.checks.worker.status).toBe("fail");
    expect(a.status).toBe("degraded");
    expect(Object.keys(a.checks)).toEqual(["web", "database", "scheduler", "worker", "queue", "ai", "searchConsole", "smtp"]);
    expect(JSON.stringify(a)).not.toContain("TESTKEY");
    for (const k of [HEARTBEAT_SCHEDULER, HEARTBEAT_WORKER]) await db.alarmState.create({ data: { key: k, detail: "test" } });
    const b = await systemHealth();
    expect(b.checks.worker.status).toBe("ok");
    expect(b.checks.scheduler.status).toBe("ok");
    expect(b.checks.ai.status).toBe("ok");
    expect((await getSettingsFresh()).email.smtpHost ? b.checks.smtp.status : "off").toBe(b.checks.smtp.status);
    await deleteSecret(ANTHROPIC_SECRET);
    await loadAiKey(true);
  });
});
