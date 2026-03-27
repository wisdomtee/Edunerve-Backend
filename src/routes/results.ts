import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import {
  requireSchoolUser,
  enforceSameSchool,
  getSchoolFilter,
} from "../middleware/school"
import fs from "fs"
import { parse } from "csv-parse/sync"
import uploadCsv from "../middleware/uploadCsv"

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

// =======================
// GET ALL RESULTS
// =======================
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const { term, session, studentId } = req.query

      const where: any = {
        ...(term ? { term: String(term) } : {}),
        ...(session ? { session: String(session) } : {}),
        ...(studentId ? { studentId: Number(studentId) } : {}),
        ...getSchoolFilter(req),
      }

      // 🔒 Parent restriction
      if (req.user?.role === "PARENT") {
        const parent = await prisma.parent.findFirst({
          where: {
            email: req.user.email,
            schoolId: req.user.schoolId!,
          },
          include: {
            students: { select: { id: true } },
          },
        })

        const allowedIds = parent?.students.map((s) => s.id) || []

        where.studentId = studentId
          ? Number(studentId)
          : { in: allowedIds }

        if (studentId && !allowedIds.includes(Number(studentId))) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      const results = await prisma.result.findMany({
        where,
        include: {
          student: true,
          subject: true,
          teacher: true,
          school: true,
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(results)
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
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)

      if (isNaN(studentId)) {
        return res.status(400).json({ message: "Invalid student ID" })
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      // 🔒 Parent restriction
      if (req.user?.role === "PARENT") {
        const parent = await prisma.parent.findFirst({
          where: {
            email: req.user.email,
            schoolId: req.user.schoolId!,
          },
          include: {
            students: { select: { id: true } },
          },
        })

        const allowedIds = parent?.students.map((s) => s.id) || []

        if (!allowedIds.includes(studentId)) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      const { term, session } = req.query

      const results = await prisma.result.findMany({
        where: {
          studentId,
          ...(term ? { term: String(term) } : {}),
          ...(session ? { session: String(session) } : {}),
        },
        include: {
          student: true,
          subject: true,
          teacher: true,
          school: true,
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(results)
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
// CREATE RESULT
// =======================
router.post(
  "/",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const { studentId, subject, subjectId, score, term, session } = req.body

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
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      let subjectRecord = null

      if (subjectId) {
        subjectRecord = await prisma.subject.findFirst({
          where: {
            id: Number(subjectId),
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

      const teacherId = await resolveTeacherId(req)

      const result = await prisma.result.create({
        data: {
          studentId: parsedStudentId,
          subjectId: subjectRecord.id,
          score: parsedScore,
          schoolId: student.schoolId,
          term: term || null,
          session: session || null,
          ...(teacherId && { teacherId }),
        },
      })

      return res.status(201).json(result)
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
// DELETE RESULT
// =======================
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      const result = await prisma.result.findUnique({
        where: { id },
      })

      if (!result) {
        return res.status(404).json({ message: "Result not found" })
      }

      enforceSameSchool(req, result.schoolId)

      await prisma.result.delete({ where: { id } })

      return res.json({ message: "Result deleted" })
    } catch (error: any) {
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