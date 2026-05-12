import { Request, Response } from "express"
import prisma from "../prisma"

export const createMeeting = async (req: Request, res: Response) => {
  try {
    const { title, scheduledAt, schoolId } = req.body

    const teacherId = (req as any).user.id

    const roomName = `school-${schoolId}-room-${Date.now()}`

    const meeting = await prisma.meeting.create({
      data: {
        title,
        scheduledAt: new Date(scheduledAt),
        schoolId,
        teacherId,
        roomName,
      },
    })

    return res.status(201).json({
      message: "Meeting created successfully",
      meeting,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create meeting",
    })
  }
}