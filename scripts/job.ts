// Zamanlanmış işler için komut satırı. Örnek cron (her gün 06:00):
//   0 6 * * * cd /srv/webtasarimajansi && npm run job -- daily
import "dotenv/config";
import { runJob, JOB_KINDS, type JobKind } from "../src/lib/jobs/runner";
import { notifyAppRevalidate } from "../src/lib/jobs/notify";

const kind = process.argv[2] as JobKind;
if (!JOB_KINDS.includes(kind)) {
  console.error(`Kullanım: npm run job -- <${JOB_KINDS.join("|")}>`);
  process.exit(2);
}
runJob(kind, "cli")
  .then(async (r) => {
    console.log(JSON.stringify(r, null, 2));
    // Analiz/fırsat gibi işler sayfa verisini değiştirir; çalışan siteyi tazele.
    if (r.status === "ok" && kind !== "crawl") {
      const ok = await notifyAppRevalidate();
      if (!ok) console.warn("Uyarı: çalışan uygulamaya önbellek tazeleme bildirimi gönderilemedi (APP_INTERNAL_URL?)");
    }
    process.exit(r.status === "error" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
