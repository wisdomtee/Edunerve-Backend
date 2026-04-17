import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { enforceSameSchool } from "../middleware/school"
import { requireActiveSubscription } from "../middleware/subscription"
import { sendNotification } from "../services/notificationService"

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

function normalizeSubjectName(value: any) {
  if (value === undefined || value === null) return ""
  return String(value).trim().replace(/\s+/g, " ")
}

function scoreToGrade(score: number) {
  if (score >= 70) return "A"
  if (score >= 60) return "B"
  if (score >= 50) return "C"
  if (score >= 45) return "D"
  if (score >= 40) return "E"
  return "F"
}

function scoreToRemark(score: number) {
  if (score >= 70) return "Excellent"
  if (score >= 60) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 45) return "Fair"
  if (score >= 40) return "Pass"
  return "Fail"
}

function overallRemarkFromAverage(score: number) {
  if (score >= 75) return "Excellent academic performance"
  if (score >= 65) return "Very good progress overall"
  if (score >= 55) return "Good performance, keep improving"
  if (score >= 45) return "Fair performance, more effort needed"
  return "Needs more academic support"
}

async function resolveSubjectForSchool(params: {
  schoolId: number
  subject?: any
  subjectId?: any
  subjectName?: any
}) {
  const { schoolId, subject, subjectId, subjectName } = params

  let subjectRecord = null

  const rawCandidates = [subjectId, subject, subjectName]

  // 1) Try resolving by numeric id from any of subjectId / subject / subjectName
  for (const candidate of rawCandidates) {
    if (candidate === undefined || candidate === null) continue

    const trimmed = String(candidate).trim()
    if (!trimmed) continue

    const parsedId = Number(trimmed)

    if (!Number.isNaN(parsedId) && String(parsedId) === trimmed) {
      subjectRecord = await prisma.subject.findFirst({
        where: {
          id: parsedId,
          schoolId,
        },
      })

      if (subjectRecord) return subjectRecord
    }
  }

  // 2) Try resolving by subject name from subject / subjectName
  const nameCandidates = [subjectName, subject]
    .map((value) => normalizeSubjectName(value))
    .filter(Boolean)

  for (const candidateName of nameCandidates) {
    subjectRecord = await prisma.subject.findFirst({
      where: {
        schoolId,
        name: {
          equals: candidateName,
          mode: "insensitive",
        },
      },
    })

    if (subjectRecord) return subjectRecord
  }

  // 3) Create subject if a valid name was supplied
  const creatableName = nameCandidates[0]

  if (creatableName) {
    subjectRecord = await prisma.subject.create({
      data: {
        name: creatableName,
        schoolId,
      },
    })
    return subjectRecord
  }

  return null
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
          where.studentId = { in: allowedIds }
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
          parent: true,
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
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        studentId,
        subject,
        subjectId,
        subjectName,
        score,
        term,
        session,
        teacherId,
      } = req.body

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
          parent: true,
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      const subjectRecord = await resolveSubjectForSchool({
        schoolId: student.schoolId,
        subject,
        subjectId,
        subjectName,
      })

      if (!subjectRecord) {
        return res.status(400).json({
          message: "Unable to resolve subject. Provide subjectId or subject name.",
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
            subjectId: subjectRecord.id,
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

      if (student.parentId) {
        await sendNotification({
          userId: student.parentId,
          title: existingResult ? "Result Updated" : "New Result Uploaded",
          body: `${student.name}'s result for ${subjectRecord.name} has been ${
            existingResult ? "updated" : "uploaded"
          }.`,
          type: "RESULT",
          data: {
            studentId: student.id,
            resultId: result.id,
          },
        })
      }

      return res.status(existingResult ? 200 : 201).json({
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
// UPDATE SINGLE RESULT
// =======================
router.patch(
  "/:id",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { score, subject, subjectId, subjectName, term, session, teacherId } =
        req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid result id" })
      }

      const existing = await prisma.result.findUnique({
        where: { id },
        include: {
          student: {
            include: {
              parent: true,
            },
          },
          subject: true,
        },
      })

      if (!existing) {
        return res.status(404).json({ message: "Result not found" })
      }

      enforceSameSchool(req, existing.schoolId)

      if (req.user?.role === "TEACHER") {
        const teacherIdFromUser = await resolveTeacherId(req)

        if (!teacherIdFromUser) {
          return res.status(404).json({
            message: "Teacher profile not found",
          })
        }

        if (existing.teacherId && existing.teacherId !== teacherIdFromUser) {
          return res.status(403).json({
            message: "You can only update your own result records",
          })
        }
      }

      const data: any = {}

      if (score !== undefined) {
        const parsedScore = Number(score)

        if (isNaN(parsedScore)) {
          return res.status(400).json({ message: "Invalid score" })
        }

        if (parsedScore < 0 || parsedScore > 100) {
          return res.status(400).json({
            message: "Score must be between 0 and 100",
          })
        }

        data.score = parsedScore
      }

      if (term !== undefined) {
        data.term = normalizeNullableString(term)
      }

      if (session !== undefined) {
        data.session = normalizeNullableString(session)
      }

      if (
        subject !== undefined ||
        subjectId !== undefined ||
        subjectName !== undefined
      ) {
        const subjectRecord = await resolveSubjectForSchool({
          schoolId: existing.schoolId,
          subject,
          subjectId,
          subjectName,
        })

        if (!subjectRecord) {
          return res.status(400).json({
            message: "Unable to resolve subject. Provide subjectId or subject name.",
          })
        }

        data.subjectId = subjectRecord.id
      }

      if (req.user?.role === "TEACHER") {
        const teacherIdFromUser = await resolveTeacherId(req)
        if (teacherIdFromUser) {
          data.teacherId = teacherIdFromUser
        }
      } else if (teacherId !== undefined) {
        const parsedTeacherId = Number(teacherId)
        if (!isNaN(parsedTeacherId)) {
          const teacher = await prisma.teacher.findFirst({
            where: {
              id: parsedTeacherId,
              schoolId: existing.schoolId,
            },
          })
          if (teacher) {
            data.teacherId = teacher.id
          }
        }
      }

      const updated = await prisma.result.update({
        where: { id },
        data,
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

      if (existing.student.parentId) {
        await sendNotification({
          userId: existing.student.parentId,
          title: "Result Updated",
          body: `${existing.student.name}'s result for ${
            updated.subject?.name || existing.subject?.name || "a subject"
          } has been updated.`,
          type: "RESULT",
          data: {
            studentId: existing.student.id,
            resultId: updated.id,
          },
        })
      }

      return res.status(200).json({
        message: "Result updated successfully",
        result: updated,
      })
    } catch (error: any) {
      console.error("PATCH RESULT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to update result",
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
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        classId,
        subject,
        subjectId,
        subjectName,
        term,
        session,
        teacherId,
        records,
      } = req.body

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

      const subjectRecord = await resolveSubjectForSchool({
        schoolId: classItem.schoolId,
        subject,
        subjectId,
        subjectName,
      })

      if (!subjectRecord) {
        return res.status(400).json({
          message: "Unable to resolve subject. Provide subjectId or subject name.",
        })
      }

      const classStudents = await prisma.student.findMany({
        where: {
          classId: parsedClassId,
          schoolId: classItem.schoolId,
        },
        select: {
          id: true,
          name: true,
          parentId: true,
        },
      })

      const studentMap = new Map(
        classStudents.map((student) => [student.id, student])
      )
      const allowedStudentIds = new Set(
        classStudents.map((student) => student.id)
      )
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

        let result

        if (existingResult) {
          result = await prisma.result.update({
            where: { id: existingResult.id },
            data: {
              score: parsedScore,
              subjectId: subjectRecord.id,
              term: normalizedTerm,
              session: normalizedSession,
              ...(resolvedTeacherId ? { teacherId: resolvedTeacherId } : {}),
            },
          })
        } else {
          result = await prisma.result.create({
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

        const student = studentMap.get(parsedStudentId)
        if (student?.parentId) {
          await sendNotification({
            userId: student.parentId,
            title: existingResult ? "Result Updated" : "New Result Uploaded",
            body: `${student.name}'s result for ${subjectRecord.name} has been ${
              existingResult ? "updated" : "uploaded"
            }.`,
            type: "RESULT",
            data: {
              studentId: student.id,
              resultId: result.id,
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
      const requestedTerm = String(req.query.term || "").trim()
      const requestedSession = String(req.query.session || "").trim()

      if (isNaN(studentId)) {
        return res.status(400).json({
          message: "Invalid student ID",
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

      const availableResults = await prisma.result.findMany({
        where: {
          studentId,
        },
        include: {
          subject: true,
          teacher: true,
        },
        orderBy: [{ session: "desc" }, { term: "desc" }, { createdAt: "desc" }],
      })

      if (availableResults.length === 0) {
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
            term: requestedTerm,
            session: requestedSession,
            totalSubjects: 0,
            totalScore: 0,
            averageScore: 0,
            overallGrade: "F",
            overallRemark: "No results available yet",
            attendanceRate: 0,
            subjects: [],
          },
        })
      }

      let term = requestedTerm
      let session = requestedSession

      if (!term || !session) {
        const latest = availableResults[0]
        term = term || String(latest.term || "").trim()
        session = session || String(latest.session || "").trim()
      }

      const results = availableResults
        .filter((item) => {
          const itemTerm = String(item.term || "").trim()
          const itemSession = String(item.session || "").trim()

          if (term && itemTerm !== term) return false
          if (session && itemSession !== session) return false
          return true
        })
        .sort((a, b) => {
          const aName = a.subject?.name || ""
          const bName = b.subject?.name || ""
          return aName.localeCompare(bName)
        })

      const attendanceWhere: any = { studentId }
      if (term) attendanceWhere.term = term
      if (session) attendanceWhere.session = session

      let attendance: any[] = []
      try {
        attendance = await prisma.attendance.findMany({
          where: attendanceWhere,
        })
      } catch {
        attendance = await prisma.attendance.findMany({
          where: { studentId },
        })
      }

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

      const subjectResults = results.map((item) => {
        const numericScore = Number(item.score || 0)

        return {
          id: item.id,
          subject: item.subject?.name || "Unknown Subject",
          score: numericScore,
          grade: scoreToGrade(numericScore),
          remark: scoreToRemark(numericScore),
          teacher: item.teacher?.name || "-",
          term: item.term || term,
          session: item.session || session,
        }
      })

      const overallGrade = scoreToGrade(averageScore)
      const overallRemark = overallRemarkFromAverage(averageScore)

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
  requireActiveSubscription,
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
        if (teacherRemark !== undefined) {
          updateData.teacherRemark = String(teacherRemark || "")
        }
      }

      if (req.user?.role === "SCHOOL_ADMIN") {
        if (teacherRemark !== undefined) {
          updateData.teacherRemark = String(teacherRemark || "")
        }
        if (principalRemark !== undefined) {
          updateData.principalRemark = String(principalRemark || "")
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
  requireActiveSubscription,
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