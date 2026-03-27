import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import {
  requireSchoolUser,
  enforceSameSchool,
  getSchoolFilter,
} from "../middleware/school"

const router = Router()

router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const teachers = await prisma.teacher.findMany({
        where: getSchoolFilter(req),
        include: {
          school: true,
          user: true,
          classes: true,
          results: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json(teachers)
    } catch (error: any) {
      console.error("GET /teachers error:", error)
      return res.status(500).json({
        message: "Failed to fetch teachers",
        error: error.message,
      })
    }
  }
)

router.get(
  "/me/summary",
  authMiddleware,
  authorizeRoles("TEACHER"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: req.user!.id },
        include: {
          classes: {
            include: {
              students: true,
            },
            orderBy: { createdAt: "desc" },
          },
          results: true,
        },
      })

      if (!teacher) {
        return res.status(404).json({ message: "Teacher profile not found" })
      }

      const classesCount = teacher.classes.length
      const studentsCount = teacher.classes.reduce(
        (sum, cls) => sum + cls.students.length,
        0
      )
      const resultsCount = teacher.results.length

      const classIds = teacher.classes.map((cls) => cls.id)

      const attendanceCount = await prisma.attendance.count({
        where: {
          student: {
            classId: {
              in: classIds.length > 0 ? classIds : [-1],
            },
          },
        },
      })

      return res.status(200).json({
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          subject: teacher.subject,
        },
        stats: {
          students: studentsCount,
          classes: classesCount,
          results: resultsCount,
          attendance: attendanceCount,
        },
        classes: teacher.classes,
      })
    } catch (error: any) {
      console.error("GET /teachers/me/summary error:", error)
      return res.status(500).json({
        message: "Failed to fetch teacher summary",
        error: error.message,
      })
    }
  }
)

router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid teacher id" })
      }

      const teacher = await prisma.teacher.findUnique({
        where: { id },
        include: {
          school: true,
          user: true,
          classes: true,
          results: {
            include: {
              student: true,
              subject: true,
              school: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      })

      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" })
      }

      enforceSameSchool(req, teacher.schoolId)

      return res.status(200).json(teacher)
    } catch (error: any) {
      console.error("GET /teachers/:id error:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to fetch teacher",
        error: error.message,
      })
    }
  }
)

router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, email, phone, subject, schoolId, userId } = req.body

      if (!name || !email || !userId) {
        return res.status(400).json({
          message: "name, email and userId are required",
        })
      }

      const parsedUserId = Number(userId)

      if (isNaN(parsedUserId)) {
        return res.status(400).json({ message: "Invalid userId" })
      }

      let parsedSchoolId: number

      if (req.user?.role === "SUPER_ADMIN") {
        parsedSchoolId = Number(schoolId)

        if (isNaN(parsedSchoolId)) {
          return res.status(400).json({
            message: "schoolId is required for super admin",
          })
        }
      } else {
        parsedSchoolId = req.user!.schoolId!
      }

      const existingSchool = await prisma.school.findUnique({
        where: { id: parsedSchoolId },
      })

      if (!existingSchool) {
        return res.status(404).json({ message: "School not found" })
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: parsedUserId },
      })

      if (!existingUser) {
        return res.status(404).json({ message: "User not found" })
      }

      if (existingUser.role !== "TEACHER") {
        return res.status(400).json({
          message: "Selected user must have TEACHER role",
        })
      }

      enforceSameSchool(req, existingUser.schoolId)

      const existingTeacherByUser = await prisma.teacher.findUnique({
        where: { userId: parsedUserId },
      })

      if (existingTeacherByUser) {
        return res.status(400).json({
          message: "This user is already linked to a teacher profile",
        })
      }

      const existingTeacherByEmail = await prisma.teacher.findUnique({
        where: { email },
      })

      if (existingTeacherByEmail) {
        return res.status(400).json({
          message: "A teacher with this email already exists",
        })
      }

      const teacher = await prisma.teacher.create({
        data: {
          name,
          email,
          phone: phone || null,
          subject: subject || null,
          schoolId: parsedSchoolId,
          userId: parsedUserId,
        },
        include: {
          school: true,
          user: true,
          classes: true,
          results: true,
        },
      })

      return res.status(201).json(teacher)
    } catch (error: any) {
      console.error("POST /teachers/create error:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to create teacher",
        error: error.message,
      })
    }
  }
)

router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, email, phone, subject } = req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid teacher id" })
      }

      const existingTeacher = await prisma.teacher.findUnique({
        where: { id },
      })

      if (!existingTeacher) {
        return res.status(404).json({ message: "Teacher not found" })
      }

      enforceSameSchool(req, existingTeacher.schoolId)

      if (email && email !== existingTeacher.email) {
        const emailTaken = await prisma.teacher.findUnique({
          where: { email },
        })

        if (emailTaken) {
          return res.status(400).json({
            message: "A teacher with this email already exists",
          })
        }
      }

      const teacher = await prisma.teacher.update({
        where: { id },
        data: {
          name: name ?? existingTeacher.name,
          email: email ?? existingTeacher.email,
          phone: phone ?? existingTeacher.phone,
          subject: subject ?? existingTeacher.subject,
        },
        include: {
          school: true,
          user: true,
          classes: true,
          results: true,
        },
      })

      return res.status(200).json(teacher)
    } catch (error: any) {
      console.error("PUT /teachers/:id error:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to update teacher",
        error: error.message,
      })
    }
  }
)

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid teacher id" })
      }

      const existingTeacher = await prisma.teacher.findUnique({
        where: { id },
      })

      if (!existingTeacher) {
        return res.status(404).json({ message: "Teacher not found" })
      }

      enforceSameSchool(req, existingTeacher.schoolId)

      await prisma.teacher.delete({
        where: { id },
      })

      return res.status(200).json({
        message: "Teacher deleted successfully",
      })
    } catch (error: any) {
      console.error("DELETE /teachers/:id error:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to delete teacher",
        error: error.message,
      })
    }
  }
)

export default router