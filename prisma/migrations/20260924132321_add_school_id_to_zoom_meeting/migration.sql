-- DropForeignKey
ALTER TABLE "Result" DROP CONSTRAINT "Result_examId_fkey";

-- AlterTable
ALTER TABLE "Result" ALTER COLUMN "examId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ZoomMeeting" ADD COLUMN     "schoolId" INTEGER;

-- CreateIndex
CREATE INDEX "ZoomMeeting_schoolId_idx" ON "ZoomMeeting"("schoolId");

-- CreateIndex
CREATE INDEX "ZoomMeeting_classId_idx" ON "ZoomMeeting"("classId");

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
