-- Yalnızca ekleme: veri kaybı yok, mevcut satırlar değişmez.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "JobRun" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "JobRun" ADD COLUMN "runAfter" TIMESTAMP(3);
CREATE INDEX "JobRun_status_runAfter_idx" ON "JobRun"("status", "runAfter");
ALTER TABLE "Keyword" ADD COLUMN "decision" JSONB;
