import { Router } from "express"
import bcrypt from "bcryptjs"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import {
  generateTempPassword,
  generateUniqueSchoolCode,
} from "../utils/schoolCredentials"

const router = Router()

router.use(authMiddleware)

function requireSuperAdmin(req: AuthRequest, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  if (req.user.role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Access denied. Super Admin only." })
  }

  next()
}

/**
 * CREATE SCHOOL + FIRST SCHOOL ADMIN
 * POST /admin/schools/create
 */
router.post(
  "/schools/create",
  requireSuperAdmin,
  async (req: AuthRequest, res) => {
    try {
      const {
        schoolName,
        schoolEmail,
        schoolPhone,
        schoolAddress,
        adminName,
        adminEmail,
        subscriptionPlan,
      } = req.body

      if (
        !schoolName?.trim() ||
        !schoolAddress?.trim() ||
        !adminName?.trim() ||
        !adminEmail?.trim()
      ) {
        return res.status(400).json({
          message:
            "schoolName, schoolAddress, adminName and adminEmail are required",
        })
      }

      const normalizedSchoolEmail = schoolEmail?.trim()?.toLowerCase() || null
      const normalizedAdminEmail = adminEmail.trim().toLowerCase()
      const normalizedPlan =
        String(subscriptionPlan || "NORMAL").toUpperCase() === "PRO"
          ? "PRO"
          : "NORMAL"

      if (normalizedSchoolEmail) {
        const existingSchoolEmail = await prisma.school.findUnique({
          where: { email: normalizedSchoolEmail },
        })

        if (existingSchoolEmail) {
          return res.status(409).json({
            message: "A school with this email already exists",
          })
        }
      }

      const existingAdminUser = await prisma.user.findUnique({
        where: { email: normalizedAdminEmail },
      })

      if (existingAdminUser) {
        return res.status(409).json({
          message: "A user with this admin email already exists",
        })
      }

      const schoolCode = await generateUniqueSchoolCode(schoolName)
      const tempPassword = generateTempPassword()
      const hashedPassword = await bcrypt.hash(tempPassword, 10)

      const created = await prisma.$transaction(async (tx) => {
        const school = await tx.school.create({
          data: {
            name: schoolName.trim(),
            email: normalizedSchoolEmail,
            phone: schoolPhone?.trim() || null,
            address: schoolAddress.trim(),
            schoolCode,
            subscriptionPlan: normalizedPlan,
            subscriptionStatus: "active",
          },
        })

        const schoolAdmin = await tx.user.create({
          data: {
            name: adminName.trim(),
            email: normalizedAdminEmail,
            password: hashedPassword,
            role: "SCHOOL_ADMIN",
            schoolId: school.id,
            mustChangePassword: true,
          },
        })

        return { school, schoolAdmin }
      })

      return res.status(201).json({
        message: "School and school admin created successfully",
        school: {
          id: created.school.id,
          name: created.school.name,
          email: created.school.email,
          phone: created.school.phone,
          address: created.school.address,
          schoolCode: created.school.schoolCode,
          subscriptionPlan: created.school.subscriptionPlan,
          subscriptionStatus: created.school.subscriptionStatus,
        },
        admin: {
          id: created.schoolAdmin.id,
          name: created.schoolAdmin.name,
          email: created.schoolAdmin.email,
          role: created.schoolAdmin.role,
          mustChangePassword: created.schoolAdmin.mustChangePassword,
        },
        credentials: {
          loginEmail: created.schoolAdmin.email,
          tempPassword,
          schoolCode: created.school.schoolCode,
        },
      })
    } catch (error) {
      console.error("Create school error:", error)
      return res.status(500).json({
        message: "Failed to create school and school admin",
      })
    }
  }
)

/**
 * LIST SCHOOLS FOR SUPER ADMIN
 * GET /admin/schools
 */
router.get("/schools", requireSuperAdmin, async (_req, res) => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        users: {
          where: { role: "SCHOOL_ADMIN" },
          select: {
            id: true,
            name: true,
            email: true,
            mustChangePassword: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return res.json(schools)
  } catch (error) {
    console.error("List schools error:", error)
    return res.status(500).json({
      message: "Failed to fetch schools",
    })
  }
})

export default router