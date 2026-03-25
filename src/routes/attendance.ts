import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { date } = req.query

    let where: any = {}

    if (date && typeof date === "string") {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)

      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      where.date = {
        gte: start,
        lte: end,
      }
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        student: true,
      },
      orderBy: {
        date: "desc",
      },
    })

    return res.status(200).json({ attendance })
  } catch (error: any) {
    console.error("GET ATTENDANCE ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch attendance",
      error: error.message,
    })
  }
})

router.post("/mark-bulk", authMiddleware, async (req, res) => {
  try {
    const { date, records } = req.body

    if (!date || !Array.isArray(records)) {
      return res.status(400).json({
        message: "date and records are required",
      })
    }

    const attendanceDate = new Date(date)
    attendanceDate.setHours(12, 0, 0, 0)

    for (const record of records) {
      const studentId = Number(record.studentId)
      const status = String(record.status || "PRESENT")

      if (!studentId) continue

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId,
          date: {
            gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
          },
        },
      })

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: { status },
        })
      } else {
        await prisma.attendance.create({
          data: {
            studentId,
            date: attendanceDate,
            status,
          },
        })
      }
    }

    return res.status(200).json({
      message: "Attendance saved successfully",
    })
  } catch (error: any) {
    console.error("MARK BULK ATTENDANCE ERROR:", error)
    return res.status(500).json({
      message: "Failed to save attendance",
      error: error.message,
    })
  }
})

export default router