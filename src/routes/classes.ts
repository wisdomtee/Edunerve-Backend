import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

// GET ALL CLASSES
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      let where: any = {}

      if (req.user?.role === "SUPER_ADMIN") {
        where = {}
      } else if (req.user?.role === "TEACHER") {
        const teacher = await prisma.teacher.findUnique({
          where: { userId: req.user.id },
        })

        // Don't crash the classes page if teacher profile is missing.
        // Return an empty list instead.
        if (!teacher) {
          return res.status(200).json({ classes: [] })
        }

        where = {
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
        }
      } else {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }

        where = {
          schoolId: req.user.schoolId,
        }
      }

      const classes = await prisma.class.findMany({
        where,
        include: {
          school: true,
          teacher: {
            include: {
              user: true,
            },
          },
          students: true,
        },
        orderBy: {
          createdAt: "desc",
        },
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

// GET ONE CLASS
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
          school: true,
          teacher: {
            include: {
              user: true,
            },
          },
          students: true,
        },
      })

      if (!foundClass) {
        return res.status(404).json({ message: "Class not found" })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this user",
          })
        }

        if (foundClass.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "Forbidden" })
        }

        if (req.user.role === "TEACHER") {
          const teacher = await prisma.teacher.findUnique({
            where: { userId: req.user.id },
          })

          if (!teacher) {
            return res.status(403).json({ message: "Forbidden" })
          }

          if (foundClass.teacherId !== teacher.id) {
            return res.status(403).json({ message: "Forbidden" })
          }
        }
      }

      return res.status(200).json(foundClass)
    } catch (error: any) {
      console.error("GET /classes/:id error:", error)
      return res.status(500).json({
        message: "Failed to fetch class",
        error: error.message,
      })
    }
  }
)

// CREATE CLASS
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, schoolId, teacherId } = req.body

      if (!name) {
        return res.status(400).json({
          message: "Name is required",
        })
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
        if (!req.user?.schoolId) {
          return res.status(400).json({
            message: "No school assigned to this admin",
          })
        }

        parsedSchoolId = req.user.schoolId
      }

      const school = await prisma.school.findUnique({
        where: { id: parsedSchoolId },
      })

      if (!school) {
        return res.status(404).json({
          message: "School not found",
        })
      }

      let parsedTeacherId: number | null = null

      if (teacherId !== undefined && teacherId !== null && teacherId !== "") {
        parsedTeacherId = Number(teacherId)

        if (isNaN(parsedTeacherId)) {
          return res.status(400).json({
            message: "Invalid teacherId",
          })
        }

        const teacher = await prisma.teacher.findUnique({
          where: { id: parsedTeacherId },
        })

        if (!teacher || teacher.schoolId !== parsedSchoolId) {
          return res.status(404).json({
            message: "Teacher not found in this school",
          })
        }
      }

      const existingClass = await prisma.class.findFirst({
        where: {
          name,
          schoolId: parsedSchoolId,
        },
      })

      if (existingClass) {
        return res.status(400).json({
          message: "A class with this name already exists in this school",
        })
      }

      const newClass = await prisma.class.create({
        data: {
          name,
          schoolId: parsedSchoolId,
          teacherId: parsedTeacherId,
        },
        include: {
          school: true,
          teacher: {
            include: {
              user: true,
            },
          },
          students: true,
        },
      })

      return res.status(201).json(newClass)
    } catch (error: any) {
      console.error("POST /classes/create error:", error)
      return res.status(500).json({
        message: "Failed to create class",
        error: error.message,
      })
    }
  }
)

// UPDATE CLASS
router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, teacherId } = req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid class id" })
      }

      const existingClass = await prisma.class.findUnique({
        where: { id },
      })

      if (!existingClass) {
        return res.status(404).json({ message: "Class not found" })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        existingClass.schoolId !== req.user?.schoolId
      ) {
        return res.status(403).json({ message: "Forbidden" })
      }

      let parsedTeacherId: number | null | undefined = existingClass.teacherId

      if (teacherId !== undefined) {
        if (teacherId === null || teacherId === "") {
          parsedTeacherId = null
        } else {
          parsedTeacherId = Number(teacherId)

          if (isNaN(parsedTeacherId)) {
            return res.status(400).json({ message: "Invalid teacherId" })
          }

          const teacher = await prisma.teacher.findUnique({
            where: { id: parsedTeacherId },
          })

          if (!teacher || teacher.schoolId !== existingClass.schoolId) {
            return res.status(404).json({
              message: "Teacher not found in this school",
            })
          }
        }
      }

      const duplicateClass = await prisma.class.findFirst({
        where: {
          name: name ?? existingClass.name,
          schoolId: existingClass.schoolId,
          NOT: { id },
        },
      })

      if (duplicateClass) {
        return res.status(400).json({
          message: "Another class with this name already exists in this school",
        })
      }

      const updatedClass = await prisma.class.update({
        where: { id },
        data: {
          name: name ?? existingClass.name,
          teacherId: parsedTeacherId,
        },
        include: {
          school: true,
          teacher: {
            include: {
              user: true,
            },
          },
          students: true,
        },
      })

      return res.status(200).json(updatedClass)
    } catch (error: any) {
      console.error("PUT /classes/:id error:", error)
      return res.status(500).json({
        message: "Failed to update class",
        error: error.message,
      })
    }
  }
)

// DELETE CLASS
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid class id" })
      }

      const existingClass = await prisma.class.findUnique({
        where: { id },
      })

      if (!existingClass) {
        return res.status(404).json({ message: "Class not found" })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        existingClass.schoolId !== req.user?.schoolId
      ) {
        return res.status(403).json({ message: "Forbidden" })
      }

      await prisma.class.delete({
        where: { id },
      })

      return res.status(200).json({ message: "Class deleted successfully" })
    } catch (error: any) {
      console.error("DELETE /classes/:id error:", error)
      return res.status(500).json({
        message: "Failed to delete class",
        error: error.message,
      })
    }
  }
)

export default router