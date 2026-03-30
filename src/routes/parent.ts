import { Router, Response } from "express"
import bcrypt from "bcrypt"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorizeRoles"

const router = Router()

router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId =
        req.user?.role === "SCHOOL_ADMIN"
          ? req.user.schoolId
          : req.query.schoolId
          ? Number(req.query.schoolId)
          : undefined

      const parents = await prisma.parent.findMany({
        where: schoolId ? { schoolId } : undefined,
        include: {
          user: true,
          students: {
            select: {
              id: true,
              name: true,
              parentId: true,
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
              school: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.json(parents)
    } catch (error) {
      console.error("GET /parents error:", error)
      return res.status(500).json({
        message: "Failed to fetch parents",
      })
    }
  }
)

router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid parent ID" })
      }

      const parent = await prisma.parent.findUnique({
        where: { id },
        include: {
          user: true,
          students: {
            include: {
              class: true,
              school: true,
            },
          },
          school: true,
        },
      })

      if (!parent) {
        return res.status(404).json({ message: "Parent not found" })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        req.user.schoolId !== parent.schoolId
      ) {
        return res.status(403).json({ message: "Access denied" })
      }

      return res.json(parent)
    } catch (error) {
      console.error("GET /parents/:id error:", error)
      return res.status(500).json({
        message: "Failed to fetch parent",
      })
    }
  }
)

router.post(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, email, phone, password, schoolId } = req.body

      if (!name || !email || !password) {
        return res.status(400).json({
          message: "Name, email and password are required",
        })
      }

      let resolvedSchoolId: number | undefined

      if (req.user?.role === "SCHOOL_ADMIN") {
        resolvedSchoolId = req.user.schoolId ?? undefined
      } else if (schoolId) {
        resolvedSchoolId = Number(schoolId)
      }

      if (!resolvedSchoolId) {
        return res.status(400).json({
          message: "School ID is required",
        })
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

      const existingParent = await prisma.parent.findUnique({
        where: { email },
      })

      if (existingParent) {
        return res.status(400).json({
          message: "A parent with this email already exists",
        })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const parent = await prisma.parent.create({
        data: {
          name,
          email,
          phone: phone || null,
          school: {
            connect: { id: resolvedSchoolId },
          },
          user: {
            create: {
              name,
              email,
              password: hashedPassword,
              role: "PARENT",
              schoolId: resolvedSchoolId,
            },
          },
        },
        include: {
          user: true,
          school: true,
          students: true,
        },
      })

      return res.status(201).json({
        message: "Parent created successfully",
        parent,
      })
    } catch (error: any) {
      console.error("POST /parents error:", error)

      if (error.code === "P2002") {
        return res.status(400).json({
          message: "Email already exists",
        })
      }

      return res.status(500).json({
        message: "Failed to create parent",
      })
    }
  }
)

router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, email, phone } = req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid parent ID" })
      }

      const existingParent = await prisma.parent.findUnique({
        where: { id },
        include: { user: true },
      })

      if (!existingParent) {
        return res.status(404).json({ message: "Parent not found" })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        req.user.schoolId !== existingParent.schoolId
      ) {
        return res.status(403).json({ message: "Access denied" })
      }

      const updatedParent = await prisma.parent.update({
        where: { id },
        data: {
          name: name ?? existingParent.name,
          email: email ?? existingParent.email,
          phone: phone ?? existingParent.phone,
          user: {
            update: {
              name: name ?? existingParent.user.name,
              email: email ?? existingParent.user.email,
            },
          },
        },
        include: {
          user: true,
          students: {
            include: {
              class: true,
              school: true,
            },
          },
          school: true,
        },
      })

      return res.json({
        message: "Parent updated successfully",
        parent: updatedParent,
      })
    } catch (error: any) {
      console.error("PUT /parents/:id error:", error)

      if (error.code === "P2002") {
        return res.status(400).json({
          message: "Email already exists",
        })
      }

      return res.status(500).json({
        message: "Failed to update parent",
      })
    }
  }
)

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid parent ID" })
      }

      const parent = await prisma.parent.findUnique({
        where: { id },
        include: {
          students: true,
          user: true,
        },
      })

      if (!parent) {
        return res.status(404).json({ message: "Parent not found" })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        req.user.schoolId !== parent.schoolId
      ) {
        return res.status(403).json({ message: "Access denied" })
      }

      await prisma.student.updateMany({
        where: { parentId: parent.id },
        data: { parentId: null },
      })

      await prisma.parent.delete({
        where: { id: parent.id },
      })

      await prisma.user.delete({
        where: { id: parent.userId },
      })

      return res.json({
        message: "Parent deleted successfully",
      })
    } catch (error) {
      console.error("DELETE /parents/:id error:", error)
      return res.status(500).json({
        message: "Failed to delete parent",
      })
    }
  }
)

export default router