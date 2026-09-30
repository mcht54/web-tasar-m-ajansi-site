-- PRODUCTION TANILAMA — YALNIZCA OKUMA.
-- Yalnızca SELECT. Oturum PGOPTIONS ile default_transaction_read_only=on açılır, ayrıca
-- BEGIN READ ONLY içinde çalışır ve ROLLBACK ile biter: PostgreSQL herhangi bir yazmayı reddeder.
-- Değişken: :'since' → deploy sonrası başlangıç (UTC, "YYYY-MM-DD HH:MM:SS"). Zaman sütunları UTC
-- (timestamp without time zone) saklanır; "şimdi" bu yüzden now() AT TIME ZONE 'utc' ile alınır.

\set ON_ERROR_STOP on
\pset pager off
\pset null '∅'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';

\echo '################ AUTOPILOT AYARI'
\echo '-- mevcut ayar anahtarları (yalnızca adlar)'
SELECT key FROM "Setting" ORDER BY key;
\echo '-- autopilot ayar değeri'
SELECT key, jsonb_pretty(value::jsonb) AS value FROM "Setting" WHERE key IN ('autopilot', 'seoAutopilot');

\echo '################ QUEUE'
SELECT id, kind, status, "startedAt", "finishedAt", "runAfter", attempts, "triggeredBy", left(message, 500) AS message
FROM "JobRun" WHERE status IN ('queued', 'running') ORDER BY "startedAt";

\echo '################ FAILED JOBS (son 24 saat)'
SELECT id, kind, status, "startedAt", "finishedAt", attempts, "triggeredBy", left(message, 2000) AS message
FROM "JobRun"
WHERE status = 'error' AND "startedAt" > (now() AT TIME ZONE 'utc') - interval '24 hours'
ORDER BY "startedAt" DESC;

\echo '################ SON AUTOPILOT RUNLARI (20)'
SELECT r.id, r.trigger, r.status, r."weekKey", r."startedAt", r."finishedAt",
  (SELECT count(*) FROM "AutopilotAction" a WHERE a."runId" = r.id) AS oneri,
  (SELECT count(*) FROM "AutopilotAction" a WHERE a."runId" = r.id AND a.status = 'applied') AS uygulanan,
  left((r.summary -> 'cycle')::text, 3000) AS cycle_ozeti,
  left(r.stages::text, 3000) AS asamalar
FROM "AutopilotRun" r ORDER BY r."startedAt" DESC LIMIT 20;

\echo '################ UYGULANAN AUTOPILOT ACTIONLARI (son 24 saat)'
SELECT a.id, a.source, a.type, a.status, a."appliedAt", a."appliedVia", a."decidedBy", a."runId", a."riskLevel",
  a."versionBeforeId", a."versionAfterId", p.path AS sayfa, a.title, a.query, a.fingerprint,
  left(a."qualityNotes", 500) AS notlar,
  left(a."proposedChanges"::text, 3000) AS degisiklik,
  left(a.proposal::text, 2000) AS proposal
FROM "AutopilotAction" a LEFT JOIN "Page" p ON p.id = a."pageId"
WHERE a."appliedAt" > (now() AT TIME ZONE 'utc') - interval '24 hours'
ORDER BY a."appliedAt";

\echo '################ DEPLOY SONRASI SEO DEĞİŞİKLİKLERİ'
\echo '-- SeoChangeLog (since sonrası)'
SELECT l."createdAt", l.path, l.field, l."userName", left(l.before, 400) AS once, left(l.after, 400) AS sonra
FROM "SeoChangeLog" l WHERE l."createdAt" >= :'since'::timestamp ORDER BY l."createdAt";
\echo '-- PageVersion (since sonrası, izlenen sayfalar + tümü)'
SELECT p.path, v.version, v."createdAt", v."userName", v.note,
  p.path IN ('/web-tasarim', '/e-ticaret-web-tasarim', '/blog/kurumsal-web-sitesi-neden-onemlidir',
    '/blog/web-sitesi-ne-kadar-surede-yapilir', '/dis-klinigi-web-tasarimi', '/google-ads-yonetimi',
    '/blog/e-ticaret-sitesi-nasil-kurulur', '/insaat-firmasi-web-tasarimi', '/kurumsal-web-tasarim',
    '/web-tasarim-fiyatlari', '/restoran-web-tasarimi') AS izlenen
FROM "PageVersion" v JOIN "Page" p ON p.id = v."pageId"
WHERE v."createdAt" >= :'since'::timestamp ORDER BY v."createdAt";
\echo '-- izlenen sayfaların şu anki alanları'
SELECT path, status, "robotsIndex", "robotsFollow", canonical, "contentUpdatedAt", "seoTitle", left("metaDescription", 200) AS meta, h1,
  left(intro, 200) AS intro, length(body) AS body_uzunluk, jsonb_array_length(COALESCE(faq::jsonb, '[]'::jsonb)) AS sss, left("relatedLinks"::text, 400) AS related
FROM "Page" WHERE path IN ('/web-tasarim', '/e-ticaret-web-tasarim', '/blog/kurumsal-web-sitesi-neden-onemlidir',
  '/blog/web-sitesi-ne-kadar-surede-yapilir', '/dis-klinigi-web-tasarimi', '/google-ads-yonetimi',
  '/blog/e-ticaret-sitesi-nasil-kurulur', '/insaat-firmasi-web-tasarimi', '/kurumsal-web-tasarim',
  '/web-tasarim-fiyatlari', '/restoran-web-tasarimi') ORDER BY path;

\echo '################ PROPOSAL → PAGE → CHANGELOG EŞLEŞMELERİ'
-- Page → PageVersion → AutopilotAction (versionAfterId = sürüm) → AutopilotRun → SeoChangeLog (aynı sayfa, ±120 sn)
SELECT p.path, v.version, v."createdAt" AS surum_zamani, v."userName" AS surum_kullanici, left(v.note, 160) AS surum_notu,
  a.id AS action_id, a.source, a.type, a."appliedVia", a."appliedAt", a."runId", r.trigger AS run_trigger, r."startedAt" AS run_baslangic,
  (SELECT string_agg(l.field || ' [' || COALESCE(l."userName", '∅') || ']', ', ' ORDER BY l.field)
     FROM "SeoChangeLog" l WHERE l."pageId" = p.id AND l."createdAt" BETWEEN v."createdAt" - interval '120 seconds' AND v."createdAt" + interval '120 seconds') AS changelog_alanlari
FROM "PageVersion" v
JOIN "Page" p ON p.id = v."pageId"
LEFT JOIN "AutopilotAction" a ON a."versionAfterId" = v.id
LEFT JOIN "AutopilotRun" r ON r.id = a."runId"
WHERE v."createdAt" >= :'since'::timestamp
ORDER BY v."createdAt";

\echo '################ KESİN AUTOPILOT KAYNAKLI DEĞİŞİKLİKLER'
-- Kesin: sürümün kendisi bir AutopilotAction'ın versionAfterId'si VE otomatik uygulanmış (auto_48h | autopilot)
SELECT p.path, v.version, v."createdAt", a.id AS action_id, a.type, a.source, a."appliedVia", a."runId", left(a.title, 160) AS title
FROM "PageVersion" v JOIN "Page" p ON p.id = v."pageId"
JOIN "AutopilotAction" a ON a."versionAfterId" = v.id
WHERE v."createdAt" >= :'since'::timestamp AND a."appliedVia" IN ('auto_48h', 'autopilot')
ORDER BY v."createdAt";

\echo '################ BELİRSİZ KALAN DEĞİŞİKLİKLER'
-- since sonrası sürüm var ama otomatik uygulanmış bir AutopilotAction'a bağlanamıyor (elle, elle onay, seed/sistem vb.)
SELECT p.path, v.version, v."createdAt", v."userName", left(v.note, 200) AS note, a.id AS action_id, a."appliedVia"
FROM "PageVersion" v JOIN "Page" p ON p.id = v."pageId"
LEFT JOIN "AutopilotAction" a ON a."versionAfterId" = v.id
WHERE v."createdAt" >= :'since'::timestamp AND (a.id IS NULL OR a."appliedVia" NOT IN ('auto_48h', 'autopilot'))
ORDER BY v."createdAt";

ROLLBACK;
