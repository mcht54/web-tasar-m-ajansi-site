-- CreateTable
CREATE TABLE "GscDimDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GscDimDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexNowSubmission" (
    "id" TEXT NOT NULL,
    "urls" TEXT[],
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "message" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "nextRetryAt" TIMESTAMP(3),
    "trigger" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexNowSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GscDimDaily_dimension_date_idx" ON "GscDimDaily"("dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GscDimDaily_date_dimension_value_key" ON "GscDimDaily"("date", "dimension", "value");

-- CreateIndex
CREATE INDEX "IndexNowSubmission_status_nextRetryAt_idx" ON "IndexNowSubmission"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "IndexNowSubmission_createdAt_idx" ON "IndexNowSubmission"("createdAt");
