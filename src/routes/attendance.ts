import { Router } from "express"
import prisma from "../prisma"
import { AttendanceStatus } from "@prisma/client"
import { authMiddleware } from "../middleware/auth"

const router = Router()

// Get attendance by date
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { date } = req.query

    if (!date) {
      return res.status(400).json({ message: "Date is required" })
    }

    const selectedDate = new Date(date as string)

    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" })
    }

    const attendance = await prisma.attendance.findMany({
      where: {
        date: selectedDate,
      },
      include: {
        student: {
          include: {
            school: true,
            classItem: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json(attendance)
  } catch (error) {
    console.error("GET /attendance error:", error)
    return res.status(500).json({ message: "Failed to fetch attendance" })
  }
})

// Mark or update single attendance
router.post("/mark", authMiddleware, async (req, res) => {
  try {
    const { studentId, date, status } = req.body as {
      studentId: string
      date: string
      status: AttendanceStatus
    }

    if (!studentId || !date || !status) {
      return res.status(400).json({
        message: "studentId, date and status are required",
      })
    }

    const selectedDate = new Date(date)

    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" })
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        studentId,
        date: selectedDate,
      },
    })

    if (existing) {
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: { status },
      })

      return res.json(updated)
    }

    const created = await prisma.attendance.create({
      data: {
        studentId,
        date: selectedDate,
        status,
      },
    })

    return res.json(created)
  } catch (error) {
    console.error("POST /attendance/mark error:", error)
    return res.status(500).json({ message: "Failed to mark attendance" })
  }
})

// Mark or update bulk attendance
router.post("/mark-bulk", authMiddleware, async (req, res) => {
  try {
    const { date, records } = req.body as {
      date: string
      records: { studentId: string; status: AttendanceStatus }[]
    }

    if (!date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        message: "date and records are required",
      })
    }

    const selectedDate = new Date(date)

    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date" })
    }

    for (const record of records) {
      if (!record.studentId || !record.status) {
        return res.status(400).json({
          message: "Each record must contain studentId and status",
        })
      }
    }

    const results = await Promise.all(
      records.map(async (record) => {
        const existing = await prisma.attendance.findFirst({
          where: {
            studentId: record.studentId,
            date: selectedDate,
          },
        })

        if (existing) {
          return prisma.attendance.update({
            where: { id: existing.id },
            data: { status: record.status },
          })
        }

        return prisma.attendance.create({
          data: {
            studentId: record.studentId,
            date: selectedDate,
            status: record.status,
          },
        })
      })
    )

    return res.status(200).json({
      message: "Bulk attendance marked successfully",
      data: results,
    })
  } catch (error) {
    console.error("POST /attendance/mark-bulk error:", error)
    return res.status(500).json({ message: "Failed to mark bulk attendance" })
  }
})

export default router