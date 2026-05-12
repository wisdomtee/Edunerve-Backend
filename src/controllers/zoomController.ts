import { Request, Response } from "express"
import prisma from "../prisma"

// CREATE ZOOM MEETING
export const createZoomMeeting = async (req: Request, res: Response) => {
  try {
    const { title, meetingId, passcode, startTime, joinUrl, classId } = req.body

    const meeting = await prisma.zoomMeeting.create({
      data: {
        title,
        meetingId,
        passcode,
        startTime: new Date(startTime),
        joinUrl,
        classId: classId ? Number(classId) : null,
      },
    })

    return res.json({
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

// GET ZOOM MEETINGS
export const getZoomMeetings = async (req: Request, res: Response) => {
  try {
    const classIdRaw = req.query.classId
    const role = req.query.role as string | undefined

    const classId =
      typeof classIdRaw === "string" ? Number(classIdRaw) : undefined

    if (classIdRaw && isNaN(classId as number)) {
      return res.status(400).json({ message: "Invalid classId" })
    }

    const meetings = await prisma.zoomMeeting.findMany({
      where: classId ? { classId } : {},
      orderBy: { startTime: "asc" },
    })

    return res.json({
      role: role ?? "unknown",
      count: meetings.length,
      meetings,
    })
  } catch (err) {
    console.error("GET_ZOOM_MEETINGS_ERROR:", err)
    return res.status(500).json({
      message: "Failed to fetch meetings",
    })
  }
}