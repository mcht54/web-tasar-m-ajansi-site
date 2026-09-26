-- AlterTable
ALTER TABLE "District" ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "neighborhoodCount" INTEGER,
ADD COLUMN     "villageCount" INTEGER;

-- AlterTable
ALTER TABLE "Province" ADD COLUMN     "altitude" INTEGER,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "isCoastal" BOOLEAN,
ADD COLUMN     "isMetropolitan" BOOLEAN,
ADD COLUMN     "municipalityCount" INTEGER,
ADD COLUMN     "neighborhoodCount" INTEGER,
ADD COLUMN     "villageCount" INTEGER;
