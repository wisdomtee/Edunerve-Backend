import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { enforceSameSchool } from "../middleware/school"

const router = Router()

async function resolveTeacherId(req: AuthRequest) {
  if (req.user?.role !== "TEACHER") return undefined
  if (!req.user.schoolId) return undefined

  const teacher = await prisma.teacher.findFirst({
    where: {
      userId: req.user.id,
      schoolId: req.user.schoolId,
    },
  })

  return teacher?.id
}

async function resolveParentStudentIds(req: AuthRequest) {
  if (!req.user || req.user.role !== "PARENT") return []

  const parent = await prisma.parent.findUnique({
    where: {
      userId: req.user.id,
    },
    include: {
      students: {
        select: { id: true },
      },
    },
  })

  return parent?.students.map((student) => student.id) || []
}

function normalizeNullableString(value: any) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

// =======================
// GET ALL RESULTS
// =======================
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { term, session, studentId, subjectId, classId } = req.query

      const where: any = {}

      if (term) where.term = String(term)
      if (session) where.session = String(session)

      if (studentId) {
        const parsedStudentId = Number(studentId)
        if (isNaN(parsedStudentId)) {
          return res.status(400).json({ message: "Invalid studentId" })
        }
        where.studentId = parsedStudentId
      }

      if (subjectId) {
        const parsedSubjectId = Number(subjectId)
        if (isNaN(parsedSubjectId)) {
          return res.status(400).json({ message: "Invalid subjectId" })
        }
        where.subjectId = parsedSubjectId
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }
        where.schoolId = req.user.schoolId
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

      if (req.user?.role === "PARENT") {
        const allowedIds = await resolveParentStudentIds(req)

        if (studentId) {
          const parsedStudentId = Number(studentId)
          if (!allowedIds.includes(parsedStudentId)) {
            return res.status(403).json({ message: "Forbidden" })
          }
        } else {
          where.studentId = {
            in: allowedIds,
          }
        }
      }

      const results = await prisma.result.findMany({
        where,
        include: {
          student: {
            include: {
              class: true,
            },
          },
          subject: true,
          teacher: true,
          school: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json({ results })
    } catch (error: any) {
      console.error("GET RESULTS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch results",
        error: error.message,
      })
    }
  }
)

// =======================
// GET RESULTS FOR ONE STUDENT
// =======================
router.get(
  "/student/:studentId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)

      if (isNaN(studentId)) {
        return res.status(400).json({ message: "Invalid student ID" })
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          class: true,
          school: true,
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        enforceSameSchool(req, student.schoolId)
      }

      if (req.user?.role === "PARENT") {
        const allowedIds = await resolveParentStudentIds(req)
        if (!allowedIds.includes(studentId)) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      const { term, session, subjectId } = req.query

      const where: any = { studentId }

      if (term) where.term = String(term)
      if (session) where.session = String(session)

      if (subjectId) {
        const parsedSubjectId = Number(subjectId)
        if (isNaN(parsedSubjectId)) {
          return res.status(400).json({ message: "Invalid subjectId" })
        }
        where.subjectId = parsedSubjectId
      }

      const results = await prisma.result.findMany({
        where,
        include: {
          student: {
            include: {
              class: true,
            },
          },
          subject: true,
          teacher: true,
          school: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json({ results })
    } catch (error: any) {
      console.error("GET STUDENT RESULTS ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to fetch student results",
        error: error.message,
      })
    }
  }
)

// =======================
// CREATE SINGLE RESULT
// =======================
router.post(
  "/",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { studentId, subject, subjectId, score, term, session, teacherId } =
        req.body

      if (!req.user?.schoolId) {
        return res.status(400).json({
          message: "No school assigned to this user",
        })
      }

      if (!studentId) {
        return res.status(400).json({ message: "studentId is required" })
      }

      const parsedStudentId = Number(studentId)
      const parsedScore = Number(score)

      if (isNaN(parsedStudentId) || isNaN(parsedScore)) {
        return res.status(400).json({ message: "Invalid input" })
      }

      if (parsedScore < 0 || parsedScore > 100) {
        return res.status(400).json({
          message: "Score must be between 0 and 100",
        })
      }

      const student = await prisma.student.findUnique({
        where: { id: parsedStudentId },
        include: {
          class: true,
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      let subjectRecord = null

      if (subjectId) {
        const parsedSubjectId = Number(subjectId)

        if (isNaN(parsedSubjectId)) {
          return res.status(400).json({
            message: "Invalid subjectId",
          })
        }

        subjectRecord = await prisma.subject.findFirst({
          where: {
            id: parsedSubjectId,
            schoolId: student.schoolId,
          },
        })
      }

      if (!subjectRecord && subject) {
        subjectRecord = await prisma.subject.findFirst({
          where: {
            name: String(subject).trim(),
            schoolId: student.schoolId,
          },
        })

        if (!subjectRecord) {
          subjectRecord = await prisma.subject.create({
            data: {
              name: String(subject).trim(),
              schoolId: student.schoolId,
            },
          })
        }
      }

      if (!subjectRecord) {
        return res.status(400).json({
          message: "Unable to resolve subject",
        })
      }

      let resolvedTeacherId: number | undefined

      if (req.user.role === "TEACHER") {
        resolvedTeacherId = await resolveTeacherId(req)
      } else if (teacherId) {
        const parsedTeacherId = Number(teacherId)

        if (!isNaN(parsedTeacherId)) {
          const teacher = await prisma.teacher.findFirst({
            where: {
              id: parsedTeacherId,
              schoolId: student.schoolId,
            },
          })

          if (teacher) {
            resolvedTeacherId = teacher.id
          }
        }
      }

      const normalizedTerm = normalizeNullableString(term)
      const normalizedSession = normalizeNullableString(session)

      const existingResult = await prisma.result.findFirst({
        where: {
          studentId: parsedStudentId,
          subjectId: subjectRecord.id,
          term: normalizedTerm,
          session: normalizedSession,
        },
      })

      let result

      if (existingResult) {
        result = await prisma.result.update({
          where: { id: existingResult.id },
          data: {
            score: parsedScore,
            ...(resolvedTeacherId ? { teacherId: resolvedTeacherId } : {}),
          },
          include: {
            student: {
              include: {
                class: true,
              },
            },
            subject: true,
            teacher: true,
            school: true,
          },
        })
      } else {
        result = await prisma.result.create({
          data: {
            studentId: parsedStudentId,
            subjectId: subjectRecord.id,
            score: parsedScore,
            schoolId: student.schoolId,
            term: normalizedTerm,
            session: normalizedSession,
            ...(resolvedTeacherId ? { teacherId: resolvedTeacherId } : {}),
          },
          include: {
            student: {
              include: {
                class: true,
              },
            },
            subject: true,
            teacher: true,
            school: true,
          },
        })
      }

      return res.status(201).json({
        message: existingResult
          ? "Result updated successfully"
          : "Result created successfully",
        result,
      })
    } catch (error: any) {
      console.error("CREATE RESULT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to create result",
        error: error.message,
      })
    }
  }
)

// =======================
// CREATE / UPDATE BULK RESULTS
// =======================
router.post(
  "/bulk",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { classId, subject, subjectId, term, session, teacherId, records } =
        req.body

      if (!req.user?.schoolId) {
        return res.status(400).json({
          message: "No school assigned to this user",
        })
      }

      const parsedClassId = Number(classId)

      if (isNaN(parsedClassId)) {
        return res.status(400).json({
          message: "Valid classId is required",
        })
      }

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({
          message: "records are required",
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

      enforceSameSchool(req, classItem.schoolId)

      let resolvedTeacherId: number | undefined

      if (req.user.role === "TEACHER") {
        resolvedTeacherId = await resolveTeacherId(req)

        if (!resolvedTeacherId) {
          return res.status(404).json({
            message: "Teacher profile not found",
          })
        }

        if (classItem.teacherId && classItem.teacherId !== resolvedTeacherId) {
          return res.status(403).json({
            message: "You can only upload results for your assigned classes",
          })
        }
      } else if (teacherId) {
        const parsedTeacherId = Number(teacherId)

        if (!isNaN(parsedTeacherId)) {
          const teacher = await prisma.teacher.findFirst({
            where: {
              id: parsedTeacherId,
              schoolId: classItem.schoolId,
            },
          })

          if (teacher) {
            resolvedTeacherId = teacher.id
          }
        }
      }

      let subjectRecord = null

      if (subjectId) {
        const parsedSubjectId = Number(subjectId)

        if (isNaN(parsedSubjectId)) {
          return res.status(400).json({
            message: "Invalid subjectId",
          })
        }

        subjectRecord = await prisma.subject.findFirst({
          where: {
            id: parsedSubjectId,
            schoolId: classItem.schoolId,
          },
        })
      }

      if (!subjectRecord && subject) {
        subjectRecord = await prisma.subject.findFirst({
          where: {
            name: String(subject).trim(),
            schoolId: classItem.schoolId,
          },
        })

        if (!subjectRecord) {
          subjectRecord = await prisma.subject.create({
            data: {
              name: String(subject).trim(),
              schoolId: classItem.schoolId,
            },
          })
        }
      }

      if (!subjectRecord) {
        return res.status(400).json({
          message: "Unable to resolve subject",
        })
      }

      const classStudents = await prisma.student.findMany({
        where: {
          classId: parsedClassId,
          schoolId: classItem.schoolId,
        },
        select: {
          id: true,
        },
      })

      const allowedStudentIds = new Set(classStudents.map((student) => student.id))
      const normalizedTerm = normalizeNullableString(term)
      const normalizedSession = normalizeNullableString(session)

      let savedCount = 0

      for (const entry of records) {
        const parsedStudentId = Number(entry.studentId)
        const parsedScore = Number(entry.score)

        if (isNaN(parsedStudentId) || isNaN(parsedScore)) continue
        if (parsedScore < 0 || parsedScore > 100) continue
        if (!allowedStudentIds.has(parsedStudentId)) continue

        const existingResult = await prisma.result.findFirst({
          where: {
            studentId: parsedStudentId,
            subjectId: subjectRecord.id,
            term: normalizedTerm,
            session: normalizedSession,
          },
        })

        if (existingResult) {
          await prisma.result.update({
            where: { id: existingResult.id },
            data: {
              score: parsedScore,
              ...(resolvedTeacherId ? { teacherId: resolvedTeacherId } : {}),
            },
          })
        } else {
          await prisma.result.create({
            data: {
              studentId: parsedStudentId,
              subjectId: subjectRecord.id,
              score: parsedScore,
              schoolId: classItem.schoolId,
              term: normalizedTerm,
              session: normalizedSession,
              ...(resolvedTeacherId ? { teacherId: resolvedTeacherId } : {}),
            },
          })
        }

        savedCount += 1
      }

      return res.status(200).json({
        message: "Bulk results saved successfully",
        savedCount,
      })
    } catch (error: any) {
      console.error("BULK RESULT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to save bulk results",
        error: error.message,
      })
    }
  }
)

// =======================
// GET REPORT CARD FOR ONE STUDENT
// =======================
router.get(
  "/report/:studentId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)
      const term = String(req.query.term || "").trim()
      const session = String(req.query.session || "").trim()

      if (isNaN(studentId)) {
        return res.status(400).json({
          message: "Invalid student ID",
        })
      }

      if (!term || !session) {
        return res.status(400).json({
          message: "term and session are required",
        })
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          class: true,
          school: true,
          parent: true,
        },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student not found",
        })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        enforceSameSchool(req, student.schoolId)
      }

      if (req.user?.role === "PARENT") {
        const allowedIds = await resolveParentStudentIds(req)
        if (!allowedIds.includes(studentId)) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }
      }

      const results = await prisma.result.findMany({
        where: {
          studentId,
          term,
          session,
        },
        include: {
          subject: true,
          teacher: true,
        },
        orderBy: {
          subject: {
            name: "asc",
          },
        },
      })

      const attendance = await prisma.attendance.findMany({
        where: {
          studentId,
        },
      })

      const totalScore = results.reduce(
        (sum, item) => sum + Number(item.score || 0),
        0
      )

      const averageScore =
        results.length > 0 ? Number((totalScore / results.length).toFixed(2)) : 0

      const presentCount = attendance.filter(
        (item) => String(item.status || "").toUpperCase() === "PRESENT"
      ).length

      const attendanceRate =
        attendance.length > 0
          ? Number(((presentCount / attendance.length) * 100).toFixed(2))
          : 0

      const getGrade = (score: number) => {
        if (score >= 70) return "A"
        if (score >= 60) return "B"
        if (score >= 50) return "C"
        if (score >= 45) return "D"
        if (score >= 40) return "E"
        return "F"
      }

      const getRemark = (score: number) => {
        if (score >= 70) return "Excellent"
        if (score >= 60) return "Very Good"
        if (score >= 50) return "Good"
        if (score >= 45) return "Fair"
        if (score >= 40) return "Pass"
        return "Fail"
      }

      const subjectResults = results.map((item) => ({
        id: item.id,
        subject: item.subject?.name || "Unknown Subject",
        score: item.score,
        grade: getGrade(Number(item.score || 0)),
        remark: getRemark(Number(item.score || 0)),
        teacher: item.teacher?.name || "-",
      }))

      const overallGrade = getGrade(averageScore)
      const overallRemark = getRemark(averageScore)

      return res.status(200).json({
        student: {
          id: student.id,
          name: student.name,
          studentId: student.studentId,
          class: student.class?.name || "-",
          school: student.school?.name || "-",
          parent: student.parent?.name || "-",
          teacherRemark: (student as any).teacherRemark || "",
          principalRemark: (student as any).principalRemark || "",
        },
        report: {
          term,
          session,
          totalSubjects: results.length,
          totalScore,
          averageScore,
          overallGrade,
          overallRemark,
          attendanceRate,
          subjects: subjectResults,
        },
      })
    } catch (error: any) {
      console.error("GET REPORT CARD ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to load report card",
        error: error.message,
      })
    }
  }
)

// =======================
// UPDATE STUDENT REMARKS
// =======================
router.put(
  "/remarks/:studentId",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)
      const { teacherRemark, principalRemark } = req.body

      if (isNaN(studentId)) {
        return res.status(400).json({
          message: "Invalid student ID",
        })
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student not found",
        })
      }

      enforceSameSchool(req, student.schoolId)

      const updateData: any = {}

      if (req.user?.role === "TEACHER") {
        updateData.teacherRemark = String(teacherRemark || "")
      }

      if (req.user?.role === "SCHOOL_ADMIN") {
        if (teacherRemark !== undefined) {
          updateData.teacherRemark = String(teacherRemark)
        }
        if (principalRemark !== undefined) {
          updateData.principalRemark = String(principalRemark)
        }
      }

      const updated = await prisma.student.update({
        where: { id: studentId },
        data: updateData,
      })

      return res.json({
        message: "Remarks updated successfully",
        student: updated,
      })
    } catch (error: any) {
      console.error("UPDATE REMARK ERROR:", error)
      return res.status(500).json({
        message: "Failed to update remarks",
        error: error.message,
      })
    }
  }
)

// =======================
// DELETE RESULT
// =======================
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({
          message: "Invalid result id",
        })
      }

      const result = await prisma.result.findUnique({
        where: { id },
      })

      if (!result) {
        return res.status(404).json({ message: "Result not found" })
      }

      enforceSameSchool(req, result.schoolId)

      if (req.user?.role === "TEACHER") {
        const teacherId = await resolveTeacherId(req)

        if (!teacherId) {
          return res.status(404).json({
            message: "Teacher profile not found",
          })
        }

        if (result.teacherId && result.teacherId !== teacherId) {
          return res.status(403).json({
            message: "You can only delete your own result records",
          })
        }
      }

      await prisma.result.delete({
        where: { id },
      })

      return res.status(200).json({
        message: "Result deleted successfully",
      })
    } catch (error: any) {
      console.error("DELETE RESULT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to delete result",
        error: error.message,
      })
    }
  }
)

export default router