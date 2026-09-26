// Sunucu açılışında otonom SEO zamanlayıcısını başlatır: 10 dakikada bir
// uygulamanın kendi /api/internal/tick uç noktasını çağırır (işler orada,
// normal sunucu bağlamında çalışır). AUTOPILOT_SCHEDULER=off ile kapatılır
// (testler, harici cron kullanan kurulumlar).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./instrumentation-node");
  startScheduler();
}
