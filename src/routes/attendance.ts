import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { requireActiveSubscription } from "../middleware/subscription"

const router = Router()

type AttendanceRecordInput = {
  studentId: number | string
  status?: string
  remark?: string | null
}

async function saveBulkAttendance(req: AuthRequest, res: Response) {
  try {
    const { date, classId, records } = req.body as {
      date?: string
      classId?: number | string | null
      records?: AttendanceRecordInput[]
    }

    if (!date || !Array.isArray(records) || records.length === 0) {
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
    let teacherProfileId: number | null = null

    if (req.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findFirst({
        where: { userId: req.user.id },
      })

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher profile not found",
        })
      }

      teacherProfileId = teacher.id
    }

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

      if (req.user.role === "TEACHER" && classItem.teacherId !== teacherProfileId) {
        return res.status(403).json({
          message: "You can only mark attendance for your assigned classes",
        })
      }
    }

    const rawDate = new Date(date)
    if (isNaN(rawDate.getTime())) {
      return res.status(400).json({
        message: "Invalid date",
      })
    }

    const dayStart = new Date(rawDate)
    dayStart.setHours(0, 0, 0, 0)

    const dayEnd = new Date(rawDate)
    dayEnd.setHours(23, 59, 59, 999)

    const attendanceDate = new Date(rawDate)
    attendanceDate.setHours(12, 0, 0, 0)

    let savedCount = 0
    let skippedCount = 0

    for (const record of records) {
      const studentId = Number(record.studentId)
      const status = String(record.status || "PRESENT").toUpperCase()

      if (!studentId || isNaN(studentId)) {
        skippedCount++
        continue
      }

      if (!["PRESENT", "ABSENT", "LATE"].includes(status)) {
        skippedCount++
        continue
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      })

      if (!student) {
        skippedCount++
        continue
      }

      if (student.schoolId !== req.user.schoolId) {
        skippedCount++
        continue
      }

      if (parsedClassId && student.classId !== parsedClassId) {
        skippedCount++
        continue
      }

      if (req.user.role === "TEACHER" && teacherProfileId) {
        const classItem = await prisma.class.findUnique({
          where: { id: student.classId },
        })

        if (!classItem || classItem.teacherId !== teacherProfileId) {
          skippedCount++
          continue
        }
      }

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId,
          date: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      })

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status,
          },
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

      savedCount++
    }

    return res.status(200).json({
      message: "Attendance saved successfully",
      savedCount,
      skippedCount,
    })
  } catch (error: any) {
    console.error("SAVE BULK ATTENDANCE ERROR:", error)
    return res.status(500).json({
      message: "Failed to save attendance",
      error: error.message,
    })
  }
}

// GET ATTENDANCE
// SUPER_ADMIN -> all attendance
// SCHOOL_ADMIN / TEACHER / PARENT -> only attendance in their school
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireActiveSubscription,
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

      if (req.user?.role === "PARENT") {
        const parent = await prisma.parent.findFirst({
          where: {
            userId: req.user.id,
          },
          include: {
            students: {
              select: {
                id: true,
              },
            },
          },
        })

        const allowedStudentIds = parent?.students.map((student) => student.id) || []

        if (studentId) {
          const parsedStudentId = Number(studentId)
          if (!allowedStudentIds.includes(parsedStudentId)) {
            return res.status(403).json({ message: "Forbidden" })
          }
        } else {
          where.studentId = {
            in: allowedStudentIds,
          }
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

// GET PARENT STUDENT ATTENDANCE SUMMARY + HISTORY
// PARENT -> only linked child
router.get(
  "/parent/student/:studentId",
  authMiddleware,
  authorizeRoles("PARENT"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)

      if (isNaN(studentId)) {
        return res.status(400).json({ message: "Invalid student id" })
      }

      const parent = await prisma.parent.findFirst({
        where: {
          userId: req.user?.id,
        },
        include: {
          students: {
            select: {
              id: true,
              name: true,
              classId: true,
              schoolId: true,
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      if (!parent) {
        return res.status(404).json({
          message: "Parent profile not found",
        })
      }

      const linkedStudent = parent.students.find((student) => student.id === studentId)

      if (!linkedStudent) {
        return res.status(403).json({
          message: "You can only access attendance for your linked child",
        })
      }

      if (req.user?.schoolId && linkedStudent.schoolId !== req.user.schoolId) {
        return res.status(403).json({
          message: "Forbidden",
        })
      }

      const records = await prisma.attendance.findMany({
        where: {
          studentId,
        },
        select: {
          id: true,
          date: true,
          status: true,
        },
        orderBy: {
          date: "desc",
        },
      })

      const summary = {
        present: records.filter((item) => item.status === "PRESENT").length,
        absent: records.filter((item) => item.status === "ABSENT").length,
        late: records.filter((item) => item.status === "LATE").length,
        total: records.length,
      }

      const attendanceRate =
        summary.total > 0
          ? Number(((summary.present / summary.total) * 100).toFixed(1))
          : 0

      return res.status(200).json({
        student: {
          id: linkedStudent.id,
          name: linkedStudent.name,
          classId: linkedStudent.classId,
          className: linkedStudent.class?.name || "",
        },
        summary: {
          ...summary,
          attendanceRate,
        },
        records,
      })
    } catch (error: any) {
      console.error("GET PARENT STUDENT ATTENDANCE ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch parent attendance",
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
  requireActiveSubscription,
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
        const teacher = await prisma.teacher.findFirst({
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
  requireActiveSubscription,
  saveBulkAttendance
)

// SAVE ATTENDANCE
// SCHOOL_ADMIN / TEACHER only
router.post(
  "/",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireActiveSubscription,
  saveBulkAttendance
)

export default router