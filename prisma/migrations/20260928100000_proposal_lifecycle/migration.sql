-- 48 saatlik onay yaşam döngüsü. Yalnızca EKLEMELİ: sütun/indeks eklenir, veri silinmez,
-- hiçbir tablo yeniden oluşturulmaz. Sabit varsayılanlı sütun (PostgreSQL 11+) tabloyu
-- yeniden yazmaz. Mevcut önerilerin durumu değişmez; hiçbiri bu migration ile otomatik
-- uygulanmaya aday olmaz (autoApply=false, expiresAt=NULL).

-- Çalışan worker tabloyu tutuyorsa sonsuza kadar bekleme; kısa sürede vazgeç (yeniden denenebilir)
SET lock_timeout = '5s';

ALTER TABLE "AutopilotAction" ALTER COLUMN "runId" DROP NOT NULL;

ALTER TABLE "AutopilotAction"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'SEO',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'autopilot',
  ADD COLUMN "riskLevel" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "autoApply" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proposedChanges" JSONB,
  ADD COLUMN "beforeSnapshot" JSONB,
  ADD COLUMN "afterSnapshot" JSONB,
  ADD COLUMN "expectedImpact" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rollbackAvailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appliedVia" TEXT,
  ADD COLUMN "decidedBy" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "validation" JSONB,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "AutopilotAction_status_expiresAt_idx" ON "AutopilotAction"("status", "expiresAt");
CREATE INDEX "AutopilotAction_fingerprint_idx" ON "AutopilotAction"("fingerprint");
CREATE INDEX "AutopilotAction_category_status_idx" ON "AutopilotAction"("category", "status");

-- Mevcut kayıtlar için türetilen bilgiler (yalnızca yeni sütunlar doldurulur)
UPDATE "AutopilotAction" SET "riskLevel" = CASE "risk" WHEN 'AUTO' THEN 'LOW' WHEN 'CONTROLLED' THEN 'MEDIUM' ELSE 'HIGH' END;
UPDATE "AutopilotAction" SET "category" = CASE "type" WHEN 'CONTENT' THEN 'CONTENT' WHEN 'NEW_PAGE' THEN 'CONTENT' WHEN 'LOCATION' THEN 'LOCAL' WHEN 'TECH' THEN 'TECH' WHEN 'BROKEN_LINK' THEN 'TECH' ELSE 'SEO' END;
UPDATE "AutopilotAction" SET "rollbackAvailable" = true, "appliedVia" = 'autopilot' WHERE "status" = 'applied';
