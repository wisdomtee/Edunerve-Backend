import express, { Request, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middlewares/auth"
import { authorizeRoles } from "../middlewares/authorize"

const router = express.Router()

// CREATE EXAM
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        title,
        subject,
        classId,
        className,
        duration,
        startTime,
        endTime,
      } = req.body

      if (!title || !subject || !classId || !className || !duration) {
        return res.status(400).json({
          message: "title, subject, classId, className and duration are required",
        })
      }

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      // SUPER_ADMIN must pass schoolId explicitly; others use their own
      const schoolId =
        req.user.role === "SUPER_ADMIN"
          ? Number(req.body.schoolId)
          : req.user.schoolId

      if (!schoolId) {
        return res.status(403).json({ message: "No school assigned to this user" })
      }

      const exam = await prisma.exam.create({
        data: {
          title,
          subject,
          classId: Number(classId),
          className,
          schoolId,
          createdBy: req.user.id,
          duration: Number(duration),
          startTime: startTime ? new Date(startTime) : null,
          endTime: endTime ? new Date(endTime) : null,
        },
      })

      return res.status(201).json(exam)
    } catch (error: any) {
      console.error("CREATE EXAM ERROR:", error)
      return res.status(500).json({
        message: error?.message || "Failed to create exam",
        meta: error?.meta || null,
      })
    }
  }
)

// ADD QUESTION
router.post(
  "/question",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { examId, text, options, answer } = req.body

      if (!examId || !text || !options || !answer) {
        return res.status(400).json({
          message: "examId, text, options and answer are required",
        })
      }

      const question = await prisma.question.create({
        data: {
          examId: Number(examId),
          text,
          options,
          answer,
        },
      })

      return res.status(201).json(question)
    } catch (error: any) {
      console.error("CREATE QUESTION ERROR:", error)
      return res.status(500).json({
        message: error?.message || "Failed to create question",
        meta: error?.meta || null,
      })
    }
  }
)

// GET ALL EXAMS
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      const where =
        req.user.role === "SUPER_ADMIN"
          ? {}
          : { schoolId: req.user.schoolId }

      const exams = await prisma.exam.findMany({
        where,
        include: { questions: true },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(exams)
    } catch (error: any) {
      console.error("GET EXAMS ERROR:", error)
      return res.status(500).json({
        message: error?.message || "Failed to fetch exams",
        meta: error?.meta || null,
      })
    }
  }
)

export default router