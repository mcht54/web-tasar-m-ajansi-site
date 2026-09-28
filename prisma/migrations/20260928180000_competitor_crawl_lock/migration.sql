-- Rakip tarama kilidi + tarama zamanları + aynı içerik işareti. Yalnızca EKLEMELİ:
-- yeni sütunlar boş başlar, mevcut veri değiştirilmez/silinmez.
SET lock_timeout = '5s';

ALTER TABLE "Competitor"
  ADD COLUMN "crawlStartedAt" TIMESTAMP(3),
  ADD COLUMN "crawlLockUntil" TIMESTAMP(3),
  ADD COLUMN "crawlLockOwner" TEXT,
  ADD COLUMN "crawlRequestedAt" TIMESTAMP(3);

ALTER TABLE "CompetitorPage" ADD COLUMN "duplicateOf" TEXT;
