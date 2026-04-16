import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

function generateSchoolCode(name: string) {
  const prefix = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 4)

  const random = Math.floor(1000 + Math.random() * 9000)
  return `${prefix || "SCH"}-${random}`
}

async function generateUniqueSchoolCode(name: string) {
  let schoolCode = generateSchoolCode(name)

  while (true) {
    const existing = await prisma.school.findUnique({
      where: { schoolCode },
      select: { id: true },
    })

    if (!existing) return schoolCode
    schoolCode = generateSchoolCode(name)
  }
}

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
            billingState: true,
            students: {
              select: {
                id: true,
              },
            },
            teachers: {
              select: {
                id: true,
              },
            },
            classes: {
              select: {
                id: true,
              },
            },
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
          billingState: true,
          students: {
            select: {
              id: true,
            },
          },
          teachers: {
            select: {
              id: true,
            },
          },
          classes: {
            select: {
              id: true,
            },
          },
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
          billingState: true,
          students: {
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          teachers: {
            orderBy: {
              createdAt: "desc",
            },
          },
          classes: {
            orderBy: {
              createdAt: "desc",
            },
          },
          invoices: {
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
          },
          payments: {
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
          },
          feeInvoices: {
            orderBy: {
              createdAt: "desc",
            },
            take: 10,
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  studentId: true,
                },
              },
              payments: {
                orderBy: {
                  paidAt: "desc",
                },
                take: 5,
              },
            },
          },
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
      const {
        name,
        address,
        phone,
        email,
        subscriptionStatus,
        plan,
        subscriptionPlan,
        billingCycle,
      } = req.body

      if (!name || !address) {
        return res.status(400).json({
          message: "Name and address are required",
        })
      }

      const trimmedName = String(name).trim()
      const trimmedAddress = String(address).trim()
      const trimmedPhone = phone ? String(phone).trim() : null
      const trimmedEmail = email ? String(email).trim().toLowerCase() : null

      if (!trimmedName || !trimmedAddress) {
        return res.status(400).json({
          message: "Name and address are required",
        })
      }

      const finalPlan =
        String(plan || subscriptionPlan || "NORMAL").trim().toUpperCase() === "PRO"
          ? "PRO"
          : "NORMAL"

      const finalSubscriptionPlan = finalPlan
      const finalBillingCycle =
        String(billingCycle || "monthly").trim().toLowerCase() === "yearly"
          ? "yearly"
          : "monthly"

      const finalSubscriptionStatus = String(
        subscriptionStatus || "active"
      ).trim().toLowerCase()

      const existingSchool = await prisma.school.findFirst({
        where: {
          OR: [
            { name: trimmedName },
            ...(trimmedEmail ? [{ email: trimmedEmail }] : []),
          ],
        },
      })

      if (existingSchool) {
        return res.status(409).json({
          message: "A school with this name or email already exists",
        })
      }

      const schoolCode = await generateUniqueSchoolCode(trimmedName)

      const now = new Date()
      const trialEndsAt = new Date(now)
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)

      const school = await prisma.$transaction(async (tx) => {
        const createdSchool = await tx.school.create({
          data: {
            name: trimmedName,
            address: trimmedAddress,
            phone: trimmedPhone,
            email: trimmedEmail,
            schoolCode,
            subscriptionStatus: finalSubscriptionStatus,
            plan: finalPlan,
            subscriptionPlan: finalSubscriptionPlan,
            billingCycle: finalBillingCycle,
            nextBillingDate: trialEndsAt,
          },
        })

        await tx.schoolBillingState.create({
          data: {
            schoolId: createdSchool.id,
            plan: finalPlan,
            status: "TRIAL",
            amount: 0,
            currency: "NGN",
            billingCycle: finalBillingCycle,
            trialStartsAt: now,
            trialEndsAt,
            nextBillingDate: trialEndsAt,
            isAutoRenew: false,
            notes: "Starter billing state auto-created when school was created",
          },
        })

        return tx.school.findUnique({
          where: { id: createdSchool.id },
          include: {
            billingState: true,
          },
        })
      })

      return res.status(201).json({
        message: "School created successfully",
        school,
        onboarding: {
          schoolCode,
          schoolName: school?.name,
          plan: school?.plan,
          billingCycle: school?.billingCycle,
          trialEndsAt: school?.billingState?.trialEndsAt ?? null,
        },
      })
    } catch (error: any) {
      console.error("POST /schools/create error:", error)
      return res.status(500).json({
        message: "Failed to create school",
        error: error.message,
      })
    }
  }
)

// REGENERATE SCHOOL CODE
// ONLY SUPER_ADMIN
router.patch(
  "/:id/regenerate-code",
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
        select: {
          id: true,
          name: true,
          schoolCode: true,
        },
      })

      if (!existingSchool) {
        return res.status(404).json({ message: "School not found" })
      }

      const newSchoolCode = await generateUniqueSchoolCode(existingSchool.name)

      const updatedSchool = await prisma.school.update({
        where: { id },
        data: {
          schoolCode: newSchoolCode,
        },
        include: {
          billingState: true,
        },
      })

      return res.status(200).json({
        message: "School code regenerated successfully",
        school: updatedSchool,
        onboarding: {
          schoolCode: newSchoolCode,
          schoolName: updatedSchool.name,
        },
      })
    } catch (error: any) {
      console.error("PATCH /schools/:id/regenerate-code error:", error)
      return res.status(500).json({
        message: "Failed to regenerate school code",
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
      const {
        name,
        address,
        phone,
        email,
        subscriptionStatus,
        plan,
        subscriptionPlan,
        billingCycle,
      } = req.body

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

      const trimmedName = String(name).trim()
      const trimmedAddress = String(address).trim()
      const trimmedPhone = phone ? String(phone).trim() : null
      const trimmedEmail = email ? String(email).trim().toLowerCase() : null

      const duplicateSchool = await prisma.school.findFirst({
        where: {
          AND: [
            {
              NOT: {
                id,
              },
            },
            {
              OR: [
                { name: trimmedName },
                ...(trimmedEmail ? [{ email: trimmedEmail }] : []),
              ],
            },
          ],
        },
      })

      if (duplicateSchool) {
        return res.status(409).json({
          message: "Another school with this name or email already exists",
        })
      }

      const finalPlan =
        req.user?.role === "SUPER_ADMIN"
          ? String(plan || subscriptionPlan || existingSchool.plan)
              .trim()
              .toUpperCase() === "PRO"
            ? "PRO"
            : "NORMAL"
          : existingSchool.plan

      const finalSubscriptionPlan =
        req.user?.role === "SUPER_ADMIN"
          ? finalPlan
          : existingSchool.subscriptionPlan

      const finalBillingCycle =
        req.user?.role === "SUPER_ADMIN"
          ? String(billingCycle || existingSchool.billingCycle)
              .trim()
              .toLowerCase() === "yearly"
            ? "yearly"
            : "monthly"
          : existingSchool.billingCycle

      const school = await prisma.school.update({
        where: { id },
        data: {
          name: trimmedName,
          address: trimmedAddress,
          phone: trimmedPhone,
          email: trimmedEmail,
          subscriptionStatus:
            req.user?.role === "SUPER_ADMIN"
              ? subscriptionStatus || existingSchool.subscriptionStatus
              : existingSchool.subscriptionStatus,
          plan: finalPlan,
          subscriptionPlan: finalSubscriptionPlan,
          billingCycle: finalBillingCycle,
        },
        include: {
          billingState: true,
        },
      })

      if (req.user?.role === "SUPER_ADMIN") {
        await prisma.schoolBillingState.updateMany({
          where: { schoolId: id },
          data: {
            plan: finalPlan,
            billingCycle: finalBillingCycle,
          },
        })
      }

      return res.status(200).json({
        message: "School updated successfully",
        school,
      })
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
        include: {
          students: {
            select: { id: true },
          },
          teachers: {
            select: { id: true },
          },
          classes: {
            select: { id: true },
          },
        },
      })

      if (!existingSchool) {
        return res.status(404).json({ message: "School not found" })
      }

      if (
        existingSchool.students.length > 0 ||
        existingSchool.teachers.length > 0 ||
        existingSchool.classes.length > 0
      ) {
        return res.status(400).json({
          message:
            "Cannot delete school because it still has students, teachers, or classes",
        })
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