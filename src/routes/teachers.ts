import { Router, Response } from "express"
import bcrypt from "bcryptjs"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { requireActiveSubscription } from "../middleware/subscription"

const router = Router()

// =======================
// GET ALL TEACHERS (FREE)
// =======================
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      let where: any = {}

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }

        where.schoolId = req.user.schoolId
      }

      const teachers = await prisma.teacher.findMany({
        where,
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

      return res.status(200).json({ teachers })
    } catch (error: any) {
      console.error("GET TEACHERS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch teachers",
        error: error.message,
      })
    }
  }
)

// =======================
// GET TEACHER PROFILE
// =======================
router.get(
  "/me",
  authMiddleware,
  authorizeRoles("TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const teacher = await prisma.teacher.findUnique({
        where: {
          userId: req.user!.id,
        },
        include: {
          school: true,
          user: true,
          classes: true,
          results: {
            include: {
              student: true,
              subject: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      })

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher profile not found",
        })
      }

      return res.status(200).json(teacher)
    } catch (error: any) {
      console.error("GET TEACHER PROFILE ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch teacher profile",
        error: error.message,
      })
    }
  }
)

// =======================
// GET TEACHER SUMMARY
// =======================
router.get(
  "/me/summary",
  authMiddleware,
  authorizeRoles("TEACHER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const teacher = await prisma.teacher.findUnique({
        where: {
          userId: req.user!.id,
        },
        include: {
          classes: {
            include: {
              students: true,
            },
          },
          results: true,
        },
      })

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher profile not found",
        })
      }

      const totalStudents = teacher.classes.reduce(
        (sum, classItem) => sum + classItem.students.length,
        0
      )

      return res.status(200).json({
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          subject: teacher.subject,
        },
        stats: {
          students: totalStudents,
          classes: teacher.classes.length,
          results: teacher.results.length,
          attendance: 0,
        },
        classes: teacher.classes.map((item) => ({
          id: item.id,
          name: item.name,
        })),
      })
    } catch (error: any) {
      console.error("GET TEACHER SUMMARY ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch teacher summary",
        error: error.message,
      })
    }
  }
)

// =======================
// GET ONE TEACHER
// =======================
router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({
          message: "Invalid teacher id",
        })
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
            },
          },
        },
      })

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found",
        })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        teacher.schoolId !== req.user.schoolId
      ) {
        return res.status(403).json({
          message: "Forbidden",
        })
      }

      return res.status(200).json(teacher)
    } catch (error: any) {
      console.error("GET ONE TEACHER ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch teacher",
        error: error.message,
      })
    }
  }
)

// =======================
// CREATE TEACHER (PAID)
// =======================
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, email, password, phone, subject, schoolId } = req.body

      if (!name || !email || !password) {
        return res.status(400).json({
          message: "name, email and password are required",
        })
      }

      let resolvedSchoolId: number

      if (req.user?.role === "SUPER_ADMIN") {
        resolvedSchoolId = Number(schoolId)

        if (isNaN(resolvedSchoolId)) {
          return res.status(400).json({
            message: "Valid schoolId is required for super admin",
          })
        }
      } else {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this admin",
          })
        }

        resolvedSchoolId = req.user.schoolId
      }

      const school = await prisma.school.findUnique({
        where: { id: resolvedSchoolId },
      })

      if (!school) {
        return res.status(404).json({
          message: "School not found",
        })
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      })

      if (existingUser) {
        return res.status(400).json({
          message: "A user with this email already exists",
        })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "TEACHER",
            schoolId: resolvedSchoolId,
          },
        })

        const teacher = await tx.teacher.create({
          data: {
            userId: user.id,
            schoolId: resolvedSchoolId,
            name,
            email,
            phone: phone || null,
            subject: subject || null,
          },
          include: {
            school: true,
            user: true,
          },
        })

        await tx.notification.create({
          data: {
            title: "Teacher Created",
            userId: req.user!.id,
          },
        })

        return teacher
      })

      return res.status(201).json(result)
    } catch (error: any) {
      console.error("CREATE TEACHER ERROR:", error)
      return res.status(500).json({
        message: "Failed to create teacher",
        error: error.message,
      })
    }
  }
)

// =======================
// UPDATE TEACHER (PAID)
// =======================
router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, email, phone, subject } = req.body

      if (isNaN(id)) {
        return res.status(400).json({
          message: "Invalid teacher id",
        })
      }

      const existingTeacher = await prisma.teacher.findUnique({
        where: { id },
        include: {
          user: true,
        },
      })

      if (!existingTeacher) {
        return res.status(404).json({
          message: "Teacher not found",
        })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        existingTeacher.schoolId !== req.user.schoolId
      ) {
        return res.status(403).json({
          message: "Forbidden",
        })
      }

      const updatedTeacher = await prisma.$transaction(async (tx) => {
        const teacher = await tx.teacher.update({
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
          },
        })

        await tx.user.update({
          where: { id: existingTeacher.userId },
          data: {
            name: name ?? existingTeacher.user.name,
            email: email ?? existingTeacher.user.email,
          },
        })

        return teacher
      })

      return res.status(200).json(updatedTeacher)
    } catch (error: any) {
      console.error("UPDATE TEACHER ERROR:", error)
      return res.status(500).json({
        message: "Failed to update teacher",
        error: error.message,
      })
    }
  }
)

// =======================
// DELETE TEACHER (PAID)
// =======================
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({
          message: "Invalid teacher id",
        })
      }

      const teacher = await prisma.teacher.findUnique({
        where: { id },
      })

      if (!teacher) {
        return res.status(404).json({
          message: "Teacher not found",
        })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        teacher.schoolId !== req.user.schoolId
      ) {
        return res.status(403).json({
          message: "Forbidden",
        })
      }

      await prisma.$transaction(async (tx) => {
        await tx.teacher.delete({
          where: { id: teacher.id },
        })

        await tx.user.delete({
          where: { id: teacher.userId },
        })
      })

      return res.status(200).json({
        message: "Teacher deleted successfully",
      })
    } catch (error: any) {
      console.error("DELETE TEACHER ERROR:", error)
      return res.status(500).json({
        message: "Failed to delete teacher",
        error: error.message,
      })
    }
  }
)

export default router