-- CreateTable
CREATE TABLE "ZoomMeeting" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "passcode" TEXT,
    "joinUrl" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "classId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoomMeeting_pkey" PRIMARY KEY ("id")
);
