import { Router, Request, Response } from "express"
import prisma from "../lib/prisma"

const router = Router()

// Get Zoom meeting by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        message: "Meeting ID is required",
      })
    }

    const meeting = await prisma.zoomMeeting.findUnique({
      where: {
        id: Number(id),
      },
    })

    if (!meeting) {
      return res.status(404).json({
        message: "Meeting not found",
      })
    }

    return res.json(meeting)
  } catch (error) {
    console.error("Zoom route error:", error)

    return res.status(500).json({
      message: "Server error",
    })
  }
})

export default router