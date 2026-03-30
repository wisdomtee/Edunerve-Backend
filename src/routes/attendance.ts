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
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { date, studentId, classId } = req.query

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

      if (classId) {
        const parsedClassId = Number(classId)

        if (isNaN(parsedClassId)) {
          return res.status(400).json({ message: "Invalid classId" })
        }

        where.student = {
          ...(where.student || {}),
          classId: parsedClassId,
        }
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }

        where.student = {
          ...(where.student || {}),
          schoolId: req.user.schoolId,
        }
      }

      const attendance = await prisma.attendance.findMany({
        where,
        include: {
          student: {
            include: {
              class: true,
            },
          },
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

// GET STUDENTS IN A CLASS FOR ATTENDANCE
router.get(
  "/class/:classId/students",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const classId = Number(req.params.classId)

      if (isNaN(classId)) {
        return res.status(400).json({ message: "Invalid class id" })
      }

      const classItem = await prisma.class.findUnique({
        where: { id: classId },
        include: {
          teacher: true,
          school: true,
        },
      })

      if (!classItem) {
        return res.status(404).json({ message: "Class not found" })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }

        if (classItem.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      if (req.user?.role === "TEACHER") {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: req.user.id },
        })

        if (!teacher) {
          return res.status(404).json({ message: "Teacher profile not found" })
        }

        if (classItem.teacherId !== teacher.id) {
          return res.status(403).json({
            message: "You can only access students in your assigned classes",
          })
        }
      }

      const students = await prisma.student.findMany({
        where: {
          classId,
        },
        include: {
          class: true,
          school: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      return res.status(200).json({ students })
    } catch (error: any) {
      console.error("GET CLASS STUDENTS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch class students",
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
      const { date, classId, records } = req.body

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

      let parsedClassId: number | null = null

      if (classId !== undefined && classId !== null && classId !== "") {
        parsedClassId = Number(classId)

        if (isNaN(parsedClassId)) {
          return res.status(400).json({
            message: "Invalid classId",
          })
        }

        const classItem = await prisma.class.findUnique({
          where: { id: parsedClassId },
        })

        if (!classItem) {
          return res.status(404).json({
            message: "Class not found",
          })
        }

        if (classItem.schoolId !== req.user.schoolId) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }

        if (req.user.role === "TEACHER") {
          const teacher = await prisma.teacher.findUnique({
            where: { userId: req.user.id },
          })

          if (!teacher) {
            return res.status(404).json({
              message: "Teacher profile not found",
            })
          }

          if (classItem.teacherId !== teacher.id) {
            return res.status(403).json({
              message: "You can only mark attendance for your assigned classes",
            })
          }
        }
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
        if (parsedClassId && student.classId !== parsedClassId) continue

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