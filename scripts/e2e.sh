#!/usr/bin/env bash
# Uçtan uca testleri TEST veritabanına bağlı ayrı bir üretim sunucusunda çalıştırır.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
export DATABASE_URL="$TEST_DATABASE_URL" SITE_URL="http://localhost:3310" PORT=3310 MEDIA_DIR="./storage/media-test" NODE_ENV=production AUTOPILOT_SCHEDULER=off EMAIL_TRANSPORT=log
case "$DATABASE_URL" in *_test*) ;; *) echo "TEST_DATABASE_URL _test ile bitmeli"; exit 1;; esac
npx prisma migrate deploy >/dev/null
SEED_ADMIN_EMAIL=test-admin@example.com SEED_ADMIN_PASSWORD=TestSifre123456 npx prisma db seed >/dev/null
# Test yöneticisinin kilidini ve şifresini sıfırla (önceki çalıştırmalardan kalmasın)
node --input-type=module -e "
import pg from 'pg'; const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
await c.query(\"update \\\"User\\\" set \\\"failedLogins\\\"=0, \\\"lockedUntil\\\"=null where email='test-admin@example.com'\");
await c.query(\"update \\\"Setting\\\" set value='{}'::jsonb where key in ('robots','seo','email')\");
await c.query(\"update \\\"Setting\\\" set value='{\\\"instantApply\\\":false}'::jsonb where key='autopilot'\");
await c.query(\"delete from \\\"RateLimit\\\"\");
await c.query(\"delete from \\\"Experiment\\\"\"); await c.query(\"delete from \\\"AutopilotRun\\\"\"); await c.query(\"delete from \\\"EmailLog\\\"\"); await c.query(\"delete from \\\"AlarmState\\\"\");
await c.query(\"update \\\"Page\\\" set \\\"relatedLinks\\\"=null where \\\"relatedLinks\\\" is not null\");
await c.query(\"update \\\"User\\\" set username='e2eadmin' where email='test-admin@example.com'\"); await c.query(\"delete from \\\"JobRun\\\" where status in ('queued','running')\");
await c.query(\"update \\\"Setting\\\" set value='{\\\"email\\\":\\\"mchttasarim@gmail.com\\\",\\\"whatsapp\\\":\\\"905319729336\\\"}'::jsonb where key='site'\");
await c.query(\"update \\\"Setting\\\" set value='{\\\"phone\\\":\\\"+90 531 972 93 36\\\",\\\"email\\\":\\\"mchttasarim@gmail.com\\\"}'::jsonb where key='business'\"); await c.end();"
NEXT_DIST_DIR=.next-e2e npx next build >/tmp/wta-e2e-build.log 2>&1 || { tail -30 /tmp/wta-e2e-build.log; exit 1; }
NEXT_DIST_DIR=.next-e2e npx next start -p 3310 >/tmp/wta-e2e-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -sf -o /dev/null http://localhost:3310/ && break; sleep 1; done
E2E_BASE=http://localhost:3310 node tests/e2e/run-e2e.mjs
