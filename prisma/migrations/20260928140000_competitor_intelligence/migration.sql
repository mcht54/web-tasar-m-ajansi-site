-- Rakip istihbaratı: yalnızca EKLEMELİ (yeni sütun + yeni tablo). Veri silinmez/değiştirilmez.
SET lock_timeout = '5s';

ALTER TABLE "Competitor"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "lastCrawlAt" TIMESTAMP(3),
  ADD COLUMN "lastStatus" INTEGER,
  ADD COLUMN "lastError" TEXT;

CREATE TABLE "CompetitorPage" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "finalUrl" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonical" TEXT,
    "robotsMeta" TEXT,
    "h1" TEXT[],
    "h2" TEXT[],
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "schemaTypes" TEXT[],
    "internalLinks" INTEGER NOT NULL DEFAULT 0,
    "links" TEXT[],
    "imagesNoAlt" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,
    "inSitemap" BOOLEAN NOT NULL DEFAULT false,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "topics" TEXT[],
    "etag" TEXT,
    "lastModified" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "CompetitorPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitorChange" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitorPage_competitorId_url_key" ON "CompetitorPage"("competitorId", "url");
CREATE INDEX "CompetitorPage_competitorId_category_idx" ON "CompetitorPage"("competitorId", "category");
CREATE INDEX "CompetitorChange_competitorId_createdAt_idx" ON "CompetitorChange"("competitorId", "createdAt");

ALTER TABLE "CompetitorPage" ADD CONSTRAINT "CompetitorPage_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitorChange" ADD CONSTRAINT "CompetitorChange_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
