import { Request, Response } from "express"
import prisma from "../prisma"

// CREATE ZOOM MEETING (ADMIN)
export const createZoomMeeting = async (req: Request, res: Response) => {
  try {
    const {
      title,
      meetingId,
      passcode,
      startTime,
      joinUrl,
      classId,
    } = req.body

    /* =========================
       VALIDATION
    ========================= */
    if (!title || !meetingId || !startTime || !joinUrl) {
      return res.status(400).json({
        message:
          "title, meetingId, startTime, and joinUrl are required",
      })
    }

    /* =========================
       DATE VALIDATION
    ========================= */
    const parsedDate = new Date(startTime)

    if (!(parsedDate instanceof Date) || isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        message: "Invalid startTime format",
      })
    }

    /* =========================
       DUPLICATE CHECK
    ========================= */
    const existingMeeting = await prisma.zoomMeeting.findUnique({
      where: { meetingId },
    })

    if (existingMeeting) {
      return res.status(409).json({
        message: "Meeting ID already exists",
      })
    }

    /* =========================
       CREATE MEETING
    ========================= */
    const meeting = await prisma.zoomMeeting.create({
      data: {
        title: title.trim(),
        meetingId: meetingId.trim(),
        passcode: passcode?.trim() || null,
        startTime: parsedDate,
        joinUrl: joinUrl.trim(),
        classId: classId ? Number(classId) : null,
      },
    })

    return res.status(201).json({
      message: "Zoom meeting created successfully",
      meeting,
    })
  } catch (err) {
    console.error("CREATE_ZOOM_ERROR:", err)

    return res.status(500).json({
      message: "Failed to create meeting",
    })
  }
}