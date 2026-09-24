import express from "express"
import prisma from "../lib/prisma"
import {
  authenticate,
  AuthRequest,
} from "../middlewares/auth.middleware"

const router = express.Router()

const STAFF_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"]

// GET meetings available to the authenticated user
router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    // Students only see meetings assigned to their own class.
    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: {
          id: user.id,
        },
        select: {
          id: true,
          schoolId: true,
          classId: true,
        },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student account not found",
        })
      }

      if (student.schoolId === null) {
        return res.status(400).json({
          message: "Student account is not linked to a school",
        })
      }

      if (student.classId === null) {
        return res.json({
          meetings: [],
        })
      }

      const meetings = await prisma.zoomMeeting.findMany({
        where: {
          schoolId: student.schoolId,
          classId: student.classId,
        },
        orderBy: {
          startTime: "asc",
        },
      })

      return res.json({
        meetings,
      })
    }

    // Staff can see meetings belonging to their school.
    const meetings = await prisma.zoomMeeting.findMany({
      where:
        user.schoolId !== null
          ? {
              schoolId: user.schoolId,
            }
          : undefined,
      orderBy: {
        startTime: "asc",
      },
    })

    return res.json({
      meetings,
    })
  } catch (error) {
    console.error("GET /api/zoom error:", error)

    return res.status(500).json({
      message: "Failed to fetch Zoom meetings",
    })
  }
})

// CREATE a meeting
router.post(
  "/create",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const user = req.user

      if (!user) {
        return res.status(401).json({
          message: "Unauthorized",
        })
      }

      if (!STAFF_ROLES.includes(user.role)) {
        return res.status(403).json({
          message: "You are not allowed to create Zoom meetings",
        })
      }

      if (user.schoolId === null) {
        return res.status(400).json({
          message: "Your account is not linked to a school",
        })
      }

      const {
        title,
        joinUrl,
        passcode,
        classId,
        startTime,
      } = req.body

      if (!title || !joinUrl) {
        return res.status(400).json({
          message: "Title and joinUrl required",
        })
      }

      let parsedStartTime = new Date()

      if (startTime) {
        const candidate = new Date(startTime)

        if (Number.isNaN(candidate.getTime())) {
          return res.status(400).json({
            message: "Invalid startTime",
          })
        }

        parsedStartTime = candidate
      }

      let parsedClassId: number | null = null

      if (
        classId !== undefined &&
        classId !== null &&
        classId !== ""
      ) {
        const value = Number(classId)

        if (!Number.isInteger(value) || value <= 0) {
          return res.status(400).json({
            message: "Invalid classId",
          })
        }

        parsedClassId = value
      }

      const newMeeting = await prisma.zoomMeeting.create({
        data: {
          title: String(title).trim(),
          meetingId: `EDU-ZOOM-${Date.now()}`,
          passcode: passcode
            ? String(passcode).trim()
            : null,
          joinUrl: String(joinUrl).trim(),
          startTime: parsedStartTime,
          classId: parsedClassId,
          schoolId: user.schoolId,
        },
      })

      return res.status(201).json({
        message: "Meeting created successfully",
        meeting: newMeeting,
      })
    } catch (error) {
      console.error("POST /api/zoom/create error:", error)

      return res.status(500).json({
        message: "Failed to create Zoom meeting",
      })
    }
  }
)

export default router
