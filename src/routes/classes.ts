import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { requireActiveSubscription } from "../middleware/subscription"

const router = Router()

// 🔒 Helper: get teacher safely
async function getTeacherByUser(userId: number) {
  return prisma.teacher.findUnique({
    where: { userId },
  })
}

// ==============================
// GET ALL CLASSES
// ==============================
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      let where: any = {}

      if (req.user?.role === "SUPER_ADMIN") {
        where = {}
      }

      else if (req.user?.role === "SCHOOL_ADMIN") {
        if (!req.user.schoolId) {
          return res.status(400).json({ message: "No school assigned" })
        }

        where = { schoolId: req.user.schoolId }
      }

      // 🔒 TEACHER → ONLY THEIR CLASSES
      else if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherByUser(req.user.id)

        if (!teacher) {
          return res.status(200).json({ classes: [] })
        }

        where = {
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
        }
      }

      // 🔒 PARENT → ONLY CHILD'S CLASS
      else if (req.user?.role === "PARENT") {
        const student = await prisma.student.findFirst({
          where: { parentId: req.user.id },
        })

        if (!student) {
          return res.status(200).json({ classes: [] })
        }

        where = {
          id: student.classId,
        }
      }

      const classes = await prisma.class.findMany({
        where,
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json({ classes })
    } catch (error: any) {
      console.error("GET /classes error:", error)
      return res.status(500).json({
        message: "Failed to fetch classes",
        error: error.message,
      })
    }
  }
)

// ==============================
// GET ONE CLASS
// ==============================
router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid class id" })
      }

      const foundClass = await prisma.class.findUnique({
        where: { id },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!foundClass) {
        return res.status(404).json({ message: "Class not found" })
      }

      // 🔒 SUPER ADMIN → full access
      if (req.user?.role === "SUPER_ADMIN") {
        return res.status(200).json(foundClass)
      }

      // 🔒 SCHOOL ADMIN → same school only
      if (req.user?.role === "SCHOOL_ADMIN") {
        if (foundClass.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "Forbidden" })
        }
        return res.status(200).json(foundClass)
      }

      // 🔒 TEACHER → only their class
      if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherByUser(req.user.id)

        if (!teacher || foundClass.teacherId !== teacher.id) {
          return res.status(403).json({ message: "Forbidden" })
        }

        return res.status(200).json(foundClass)
      }

      // 🔒 PARENT → only child's class
      if (req.user?.role === "PARENT") {
        const student = await prisma.student.findFirst({
          where: { parentId: req.user.id },
        })

        if (!student || student.classId !== foundClass.id) {
          return res.status(403).json({ message: "Forbidden" })
        }

        return res.status(200).json(foundClass)
      }

      return res.status(403).json({ message: "Forbidden" })
    } catch (error: any) {
      console.error("GET /classes/:id error:", error)
      return res.status(500).json({
        message: "Failed to fetch class",
        error: error.message,
      })
    }
  }
)

// ==============================
// CREATE CLASS
// ==============================
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, schoolId, teacherId } = req.body

      if (!name) {
        return res.status(400).json({ message: "Name is required" })
      }

      let parsedSchoolId: number

      if (req.user.role === "SUPER_ADMIN") {
        parsedSchoolId = Number(schoolId)
        if (isNaN(parsedSchoolId)) {
          return res.status(400).json({
            message: "schoolId required",
          })
        }
      } else {
        parsedSchoolId = req.user.schoolId!
      }

      let parsedTeacherId: number | null = null

      if (teacherId) {
        parsedTeacherId = Number(teacherId)

        const teacher = await prisma.teacher.findUnique({
          where: { id: parsedTeacherId },
        })

        if (!teacher || teacher.schoolId !== parsedSchoolId) {
          return res.status(400).json({
            message: "Invalid teacher",
          })
        }
      }

      const newClass = await prisma.class.create({
        data: {
          name,
          schoolId: parsedSchoolId,
          teacherId: parsedTeacherId,
        },
      })

      return res.status(201).json(newClass)
    } catch (error: any) {
      console.error("CREATE CLASS error:", error)
      return res.status(500).json({
        message: "Failed to create class",
      })
    }
  }
)

// ==============================
// DELETE CLASS
// ==============================
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      const existingClass = await prisma.class.findUnique({
        where: { id },
      })

      if (!existingClass) {
        return res.status(404).json({ message: "Class not found" })
      }

      if (
        req.user.role === "SCHOOL_ADMIN" &&
        existingClass.schoolId !== req.user.schoolId
      ) {
        return res.status(403).json({ message: "Forbidden" })
      }

      await prisma.class.delete({ where: { id } })

      return res.status(200).json({ message: "Deleted successfully" })
    } catch (error: any) {
      return res.status(500).json({ message: "Delete failed" })
    }
  }
)

export default router