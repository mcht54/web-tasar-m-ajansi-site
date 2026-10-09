import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

const routing = vi.hoisted(() => ({
  routingState: vi.fn(),
  recordNotFound: vi.fn(async () => {}),
  recordRedirectHit: vi.fn(async () => {}),
}));
vi.mock("@/lib/routing/registry", () => routing);

import { NOT_FOUND_PATH, proxy } from "@/proxy";
import { validatePath } from "@/lib/admin/pages";

const BASE = "http://localhost:3300";
const event = { waitUntil: () => {} } as unknown as NextFetchEvent;
const call = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => proxy(new NextRequest(BASE + path, init), event);
const rewriteOf = (res: Response) => res.headers.get("x-middleware-rewrite");

beforeEach(() => {
  vi.clearAllMocks();
  routing.routingState.mockResolvedValue({
    redirects: new Map([["/eski-sayfa", { id: "r1", to: "/web-tasarim", code: 301 }]]),
    published: new Set(["/", "/web-tasarim", "/blog/web-tasarim-nedir"]),
    at: Date.now(),
  });
});

describe("proxy: bilinmeyen adresler ISR önbelleğini doldurmaz", () => {
  it("bot denemeleri ve bilinmeyen adresler tek 404 adresine yazılır", async () => {
    for (const path of ["/wp-login.php", "/wp-content/plugins/x/y.php", "/.env", "/api.php", "/olmayan-sayfa", "/web-tasarim/sakarya"]) {
      const res = await call(path);
      expect(rewriteOf(res), path).toBe(BASE + NOT_FOUND_PATH);
    }
  });

  it("GET dışındaki yöntemler de yazılır (POST denemeleri de önbellek kaydı bırakır)", async () => {
    for (const method of ["HEAD", "POST", "DELETE"]) expect(rewriteOf(await call("/xmlrpc.php", { method })), method).toBe(BASE + NOT_FOUND_PATH);
  });

  it("yayındaki sayfaya POST (sunucu eylemi) yazılmaz", async () => {
    expect(rewriteOf(await call("/web-tasarim", { method: "POST" }))).toBeNull();
  });

  it("404 kaydı özgün adresle ve yalnızca GET için tutulur", async () => {
    await call("/wp-login.php", { headers: { "user-agent": "curl/8" } });
    expect(routing.recordNotFound).toHaveBeenCalledWith("/wp-login.php", null, "curl/8");
    routing.recordNotFound.mockClear();
    await call("/wp-login.php", { method: "HEAD" });
    expect(routing.recordNotFound).not.toHaveBeenCalled();
  });

  it("ortak 404 adresi hiçbir zaman gerçek bir sayfa URL'si olamaz", () => {
    expect(validatePath(NOT_FOUND_PATH)).not.toBeNull();
  });
});

describe("proxy: mevcut davranış korunur", () => {
  it("yayındaki sayfalar yazılmaz ve 404 kaydı tutulmaz", async () => {
    for (const path of ["/", "/web-tasarim", "/blog/web-tasarim-nedir", "/%77eb-tasarim"]) {
      const res = await call(path);
      expect(rewriteOf(res), path).toBeNull();
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
    expect(routing.recordNotFound).not.toHaveBeenCalled();
  });

  it("uygulama rotaları (og, health, yönetim) yazılmaz", async () => {
    for (const path of ["/og/web-tasarim", "/health", "/yonetim/giris"]) expect(rewriteOf(await call(path)), path).toBeNull();
  });

  it("yönetim paneli oturumsuz istekte girişe yönlendirir", async () => {
    const res = await call("/yonetim/sayfalar");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/yonetim/giris?sonra=%2Fyonetim%2Fsayfalar`);
  });

  it("yönlendirmeler 404'ten önce uygulanır", async () => {
    const res = await call("/eski-sayfa?a=1");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${BASE}/web-tasarim?a=1`);
    expect(routing.recordRedirectHit).toHaveBeenCalledWith("r1");
    expect(routing.recordNotFound).not.toHaveBeenCalled();
  });

  it("büyük harfli adres küçük harfe 301 olur", async () => {
    const res = await call("/Web-Tasarim");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${BASE}/web-tasarim`);
  });

  it("parametreli adrese noindex başlığı eklenir (bilinen ve bilinmeyen)", async () => {
    expect((await call("/web-tasarim?utm=x")).headers.get("x-robots-tag")).toBe("noindex, follow");
    const unknown = await call("/olmayan?utm=x");
    expect(unknown.headers.get("x-robots-tag")).toBe("noindex, follow");
    expect(rewriteOf(unknown)).toBe(BASE + NOT_FOUND_PATH);
  });

  it("veritabanına erişilemezse hiçbir adres 404'e yazılmaz", async () => {
    routing.routingState.mockRejectedValue(new Error("db yok"));
    const res = await call("/web-tasarim");
    expect(rewriteOf(res)).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
