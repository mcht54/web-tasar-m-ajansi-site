-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN     "clusterId" TEXT,
ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "intents" TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "relatedLinks" JSONB;

-- CreateTable
CREATE TABLE "KeywordCluster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 5,
    "targetPageId" TEXT,
    "provinceId" INTEGER,
    "districtId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutopilotRun" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trigger" TEXT,
    "stages" JSONB,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutopilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutopilotAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "pageId" TEXT,
    "query" TEXT,
    "clusterId" TEXT,
    "proposal" JSONB,
    "before" JSONB,
    "after" JSONB,
    "versionBeforeId" TEXT,
    "versionAfterId" TEXT,
    "qualityNotes" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AutopilotAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "actionId" TEXT,
    "pageId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "query" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "baseline" JSONB NOT NULL,
    "result" JSONB,
    "outcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "evaluatedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlarmState" (
    "key" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlarmState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeywordCluster_key_key" ON "KeywordCluster"("key");

-- CreateIndex
CREATE INDEX "AutopilotRun_weekKey_idx" ON "AutopilotRun"("weekKey");

-- CreateIndex
CREATE INDEX "AutopilotAction_status_idx" ON "AutopilotAction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_actionId_key" ON "Experiment"("actionId");

-- CreateIndex
CREATE INDEX "Experiment_status_appliedAt_idx" ON "Experiment"("status", "appliedAt");

-- CreateIndex
CREATE INDEX "EmailLog_kind_createdAt_idx" ON "EmailLog"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "KeywordCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotAction" ADD CONSTRAINT "AutopilotAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutopilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AutopilotAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
