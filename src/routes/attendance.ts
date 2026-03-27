import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

// GET ATTENDANCE
// SUPER_ADMIN -> all attendance
// SCHOOL_ADMIN / TEACHER -> only attendance in their school
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { date, studentId } = req.query

      const where: any = {}

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

      if (studentId) {
        const parsedStudentId = Number(studentId)

        if (isNaN(parsedStudentId)) {
          return res.status(400).json({ message: "Invalid studentId" })
        }

        where.studentId = parsedStudentId
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        where.student = {
          schoolId: req.user.schoolId!,
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
  }
)

// MARK BULK ATTENDANCE
// SCHOOL_ADMIN / TEACHER only
router.post(
  "/mark-bulk",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { date, records } = req.body

      if (!date || !Array.isArray(records)) {
        return res.status(400).json({
          message: "date and records are required",
        })
      }

      if (!req.user?.schoolId) {
        return res.status(400).json({
          message: "No school assigned to this user",
        })
      }

      const attendanceDate = new Date(date)
      attendanceDate.setHours(12, 0, 0, 0)

      for (const record of records) {
        const studentId = Number(record.studentId)
        const status = String(record.status || "PRESENT").toUpperCase()

        if (!studentId) continue
        if (!["PRESENT", "ABSENT", "LATE"].includes(status)) continue

        const student = await prisma.student.findUnique({
          where: { id: studentId },
        })

        if (!student) continue
        if (student.schoolId !== req.user.schoolId) continue

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
  }
)

export default router