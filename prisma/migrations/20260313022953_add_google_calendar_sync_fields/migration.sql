-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "googleEventId" VARCHAR(255),
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncStatus" VARCHAR(50),
ADD COLUMN     "googleSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Appointment_googleEventId_idx" ON "Appointment"("googleEventId");
