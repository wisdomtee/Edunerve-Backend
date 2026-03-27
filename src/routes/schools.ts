import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

// GET schools
// SUPER_ADMIN -> all schools
// SCHOOL_ADMIN / TEACHER / PARENT -> only their own school
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role === "SUPER_ADMIN") {
        const schools = await prisma.school.findMany({
          include: {
            students: true,
            teachers: true,
            classes: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        })

        return res.status(200).json({ schools })
      }

      if (!req.user?.schoolId) {
        return res.status(400).json({
          message: "No school assigned to this user",
        })
      }

      const school = await prisma.school.findUnique({
        where: { id: req.user.schoolId },
        include: {
          students: true,
          teachers: true,
          classes: true,
        },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      return res.status(200).json({ schools: [school] })
    } catch (error: any) {
      console.error("GET /schools error:", error)
      return res.status(500).json({
        message: "Failed to fetch schools",
        error: error.message,
      })
    }
  }
)

// GET one school by id
// SUPER_ADMIN -> any school
// SCHOOL_ADMIN / TEACHER / PARENT -> only their own school
router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      if (req.user?.role !== "SUPER_ADMIN" && req.user?.schoolId !== id) {
        return res.status(403).json({
          message: "Forbidden: You can only view your own school",
        })
      }

      const school = await prisma.school.findUnique({
        where: { id },
        include: {
          students: true,
          teachers: true,
          classes: true,
        },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      return res.status(200).json(school)
    } catch (error: any) {
      console.error("GET /schools/:id error:", error)
      return res.status(500).json({
        message: "Failed to fetch school",
        error: error.message,
      })
    }
  }
)

// CREATE school
// ONLY SUPER_ADMIN
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, address, phone, email, subscriptionStatus } = req.body

      if (!name || !address) {
        return res.status(400).json({
          message: "Name and address are required",
        })
      }

      const school = await prisma.school.create({
        data: {
          name,
          address,
          phone: phone || null,
          email: email || null,
          subscriptionStatus: subscriptionStatus || "active",
        },
      })

      return res.status(201).json(school)
    } catch (error: any) {
      console.error("POST /schools/create error:", error)
      return res.status(500).json({
        message: "Failed to create school",
        error: error.message,
      })
    }
  }
)

// UPDATE school
// SUPER_ADMIN -> any school
// SCHOOL_ADMIN -> only own school
router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, address, phone, email, subscriptionStatus } = req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      if (!name || !address) {
        return res.status(400).json({
          message: "Name and address are required",
        })
      }

      if (req.user?.role === "SCHOOL_ADMIN" && req.user.schoolId !== id) {
        return res.status(403).json({
          message: "Forbidden: You can only update your own school",
        })
      }

      const existingSchool = await prisma.school.findUnique({
        where: { id },
      })

      if (!existingSchool) {
        return res.status(404).json({ message: "School not found" })
      }

      const school = await prisma.school.update({
        where: { id },
        data: {
          name,
          address,
          phone: phone ?? existingSchool.phone,
          email: email ?? existingSchool.email,
          subscriptionStatus:
            req.user?.role === "SUPER_ADMIN"
              ? subscriptionStatus ?? existingSchool.subscriptionStatus
              : existingSchool.subscriptionStatus,
        },
      })

      return res.status(200).json(school)
    } catch (error: any) {
      console.error("PUT /schools/:id error:", error)
      return res.status(500).json({
        message: "Failed to update school",
        error: error.message,
      })
    }
  }
)

// DELETE school
// ONLY SUPER_ADMIN
router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const existingSchool = await prisma.school.findUnique({
        where: { id },
      })

      if (!existingSchool) {
        return res.status(404).json({ message: "School not found" })
      }

      await prisma.school.delete({
        where: { id },
      })

      return res.status(200).json({ message: "School deleted successfully" })
    } catch (error: any) {
      console.error("DELETE /schools/:id error:", error)
      return res.status(500).json({
        message: "Failed to delete school",
        error: error.message,
      })
    }
  }
)

export default router