import { Router, Response } from "express"
import bcrypt from "bcryptjs"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { sendSchoolOnboardingEmail } from "../services/emailService"

const router = Router()

function generateSchoolCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "EDU-"

  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return code
}

function generateTempPassword(length = 10) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#"
  let password = ""

  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return password
}

async function generateUniqueSchoolCode() {
  let schoolCode = generateSchoolCode()
  let exists = await prisma.school.findUnique({
    where: { schoolCode },
    select: { id: true },
  })

  while (exists) {
    schoolCode = generateSchoolCode()
    exists = await prisma.school.findUnique({
      where: { schoolCode },
      select: { id: true },
    })
  }

  return schoolCode
}

function slugifySchoolName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "")
    .trim()
}

function normalizePlan(value?: string) {
  return String(value || "NORMAL").trim().toUpperCase() === "PRO"
    ? "PRO"
    : "NORMAL"
}

function normalizeBillingCycle(value?: string) {
  return String(value || "monthly").trim().toLowerCase() === "yearly"
    ? "yearly"
    : "monthly"
}

function normalizeSubscriptionStatus(value?: string) {
  const allowed = ["active", "trial", "past_due", "suspended", "cancelled"]
  const normalized = String(value || "active").trim().toLowerCase()
  return allowed.includes(normalized) ? normalized : "active"
}

function buildDefaultAddress(schoolName: string) {
  return `${schoolName} Address`
}

function buildSchoolEmailFromName(schoolName: string) {
  return `${slugifySchoolName(schoolName)}@school.edunerve.local`
}

async function sendOnboardingEmailSafe(params: {
  to: string
  schoolName: string
  schoolCode: string
  email: string
  password: string
}) {
  try {
    await sendSchoolOnboardingEmail({
      to: params.to,
      schoolName: params.schoolName,
      schoolCode: params.schoolCode,
      email: params.email,
      password: params.password,
    })

    console.log("📧 Onboarding email sent to:", params.to)

    return {
      sent: true,
      error: "",
    }
  } catch (emailError: any) {
    console.error("❌ EMAIL SEND ERROR:", emailError)

    return {
      sent: false,
      error: emailError?.message || "Failed to send email",
    }
  }
}

router.post(
  "/create-school",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        schoolName,
        address,
        phone,
        schoolEmail,
        adminName,
        adminEmail,
        plan,
        billingCycle,
        subscriptionStatus,
      } = req.body

      if (!schoolName || String(schoolName).trim().isEmpty) {
        return res.status(400).json({
          message: "schoolName is required",
        })
      }

      const cleanSchoolName = String(schoolName).trim()
      const cleanAddress =
        address?.toString().trim() || buildDefaultAddress(cleanSchoolName)
      const cleanPhone = phone?.toString().trim() || null
      const cleanSchoolEmail = (
        schoolEmail?.toString().trim().toLowerCase() ||
        buildSchoolEmailFromName(cleanSchoolName)
      ).trim()

      const cleanAdminName =
        adminName?.toString().trim() || `${cleanSchoolName} Admin`

      const fallbackAdminEmail = `${slugifySchoolName(cleanSchoolName)}@edunerve.local`
      const cleanAdminEmail =
        adminEmail?.toString().trim().toLowerCase() || fallbackAdminEmail

      const finalPlan = normalizePlan(plan)
      const finalBillingCycle = normalizeBillingCycle(billingCycle)
      const finalSubscriptionStatus =
        normalizeSubscriptionStatus(subscriptionStatus)

      const existingSchool = await prisma.school.findFirst({
        where: {
          OR: [
            { name: cleanSchoolName },
            { email: cleanSchoolEmail },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      })

      if (existingSchool) {
        return res.status(400).json({
          message: "A school with this name or email already exists",
        })
      }

      const existingEmailUser = await prisma.user.findFirst({
        where: {
          email: cleanAdminEmail,
        },
        select: {
          id: true,
          email: true,
          schoolId: true,
        },
      })

      if (existingEmailUser) {
        return res.status(400).json({
          message: "This admin email is already in use",
        })
      }

      const schoolCode = await generateUniqueSchoolCode()
      const tempPassword = generateTempPassword()
      const hashedPassword = await bcrypt.hash(tempPassword, 10)

      const now = new Date()
      const trialEndsAt = new Date(now)
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)

      const result = await prisma.$transaction(async (tx) => {
        const school = await tx.school.create({
          data: {
            name: cleanSchoolName,
            address: cleanAddress,
            phone: cleanPhone,
            email: cleanSchoolEmail,
            schoolCode,
            plan: finalPlan,
            subscriptionPlan: finalPlan,
            subscriptionStatus: finalSubscriptionStatus,
            billingCycle: finalBillingCycle,
            nextBillingDate: trialEndsAt,
          },
        })

        await tx.schoolBillingState.create({
          data: {
            schoolId: school.id,
            plan: finalPlan,
            status: "TRIAL",
            amount: 0,
            currency: "NGN",
            billingCycle: finalBillingCycle,
            trialStartsAt: now,
            trialEndsAt,
            nextBillingDate: trialEndsAt,
            isAutoRenew: false,
            notes: "Auto-created during school onboarding",
          },
        })

        const adminUser = await tx.user.create({
          data: {
            name: cleanAdminName,
            email: cleanAdminEmail,
            password: hashedPassword,
            role: "SCHOOL_ADMIN",
            schoolId: school.id,
            mustChangePassword: true,
          },
        })

        const fullSchool = await tx.school.findUnique({
          where: { id: school.id },
          include: {
            billingState: true,
          },
        })

        return {
          school: fullSchool!,
          adminUser,
        }
      })

      const emailStatus = await sendOnboardingEmailSafe({
        to: cleanAdminEmail,
        schoolName: result.school.name,
        schoolCode: result.school.schoolCode,
        email: result.adminUser.email,
        password: tempPassword,
      })

      return res.status(201).json({
        message: emailStatus.sent
          ? "School onboarded successfully and email sent"
          : "School onboarded successfully but email failed to send",
        school: {
          id: result.school.id,
          name: result.school.name,
          address: result.school.address,
          phone: result.school.phone,
          email: result.school.email,
          schoolCode: result.school.schoolCode,
          plan: result.school.plan,
          billingCycle: result.school.billingCycle,
          subscriptionStatus: result.school.subscriptionStatus,
          billingState: result.school.billingState,
        },
        admin: {
          id: result.adminUser.id,
          name: result.adminUser.name,
          email: result.adminUser.email,
          role: result.adminUser.role,
          mustChangePassword: result.adminUser.mustChangePassword,
        },
        credentials: {
          schoolCode: result.school.schoolCode,
          email: result.adminUser.email,
          temporaryPassword: tempPassword,
        },
        emailStatus,
      })
    } catch (error: any) {
      console.error("CREATE SCHOOL ERROR:", error)
      return res.status(500).json({
        message: "Failed to onboard school",
        error: error.message,
      })
    }
  }
)

router.post(
  "/bulk-create-schools",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { schools } = req.body

      if (!Array.isArray(schools) || schools.length === 0) {
        return res.status(400).json({
          message: "schools array is required",
        })
      }

      const createdSchools: any[] = []
      const failedSchools: any[] = []

      for (const item of schools) {
        try {
          const schoolName = item?.schoolName?.toString().trim()

          if (!schoolName) {
            failedSchools.push({
              schoolName: item?.schoolName || "",
              reason: "schoolName is required",
            })
            continue
          }

          const cleanAddress =
            item?.address?.toString().trim() || buildDefaultAddress(schoolName)
          const cleanPhone = item?.phone?.toString().trim() || null
          const cleanSchoolEmail = (
            item?.schoolEmail?.toString().trim().toLowerCase() ||
            buildSchoolEmailFromName(schoolName)
          ).trim()

          const adminName =
            item?.adminName?.toString().trim() || `${schoolName} Admin`

          const adminEmail =
            item?.adminEmail?.toString().trim().toLowerCase() ||
            `${slugifySchoolName(schoolName)}@edunerve.local`

          const finalPlan = normalizePlan(item?.plan)
          const finalBillingCycle = normalizeBillingCycle(item?.billingCycle)
          const finalSubscriptionStatus = normalizeSubscriptionStatus(
            item?.subscriptionStatus
          )

          const existingSchool = await prisma.school.findFirst({
            where: {
              OR: [
                { name: schoolName },
                { email: cleanSchoolEmail },
              ],
            },
            select: {
              id: true,
            },
          })

          if (existingSchool) {
            failedSchools.push({
              schoolName,
              reason: "A school with this name or email already exists",
            })
            continue
          }

          const existingEmailUser = await prisma.user.findFirst({
            where: {
              email: adminEmail,
            },
            select: {
              id: true,
            },
          })

          if (existingEmailUser) {
            failedSchools.push({
              schoolName,
              reason: `Admin email already in use: ${adminEmail}`,
            })
            continue
          }

          const schoolCode = await generateUniqueSchoolCode()
          const tempPassword = generateTempPassword()
          const hashedPassword = await bcrypt.hash(tempPassword, 10)

          const now = new Date()
          const trialEndsAt = new Date(now)
          trialEndsAt.setDate(trialEndsAt.getDate() + 14)

          const result = await prisma.$transaction(async (tx) => {
            const school = await tx.school.create({
              data: {
                name: schoolName,
                address: cleanAddress,
                phone: cleanPhone,
                email: cleanSchoolEmail,
                schoolCode,
                plan: finalPlan,
                subscriptionPlan: finalPlan,
                subscriptionStatus: finalSubscriptionStatus,
                billingCycle: finalBillingCycle,
                nextBillingDate: trialEndsAt,
              },
            })

            await tx.schoolBillingState.create({
              data: {
                schoolId: school.id,
                plan: finalPlan,
                status: "TRIAL",
                amount: 0,
                currency: "NGN",
                billingCycle: finalBillingCycle,
                trialStartsAt: now,
                trialEndsAt,
                nextBillingDate: trialEndsAt,
                isAutoRenew: false,
                notes: "Auto-created during bulk school onboarding",
              },
            })

            const adminUser = await tx.user.create({
              data: {
                name: adminName,
                email: adminEmail,
                password: hashedPassword,
                role: "SCHOOL_ADMIN",
                schoolId: school.id,
                mustChangePassword: true,
              },
            })

            const fullSchool = await tx.school.findUnique({
              where: { id: school.id },
              include: {
                billingState: true,
              },
            })

            return {
              school: fullSchool!,
              adminUser,
            }
          })

          const emailStatus = await sendOnboardingEmailSafe({
            to: adminEmail,
            schoolName: result.school.name,
            schoolCode: result.school.schoolCode,
            email: result.adminUser.email,
            password: tempPassword,
          })

          createdSchools.push({
            school: {
              id: result.school.id,
              name: result.school.name,
              address: result.school.address,
              phone: result.school.phone,
              email: result.school.email,
              schoolCode: result.school.schoolCode,
              plan: result.school.plan,
              billingCycle: result.school.billingCycle,
              subscriptionStatus: result.school.subscriptionStatus,
              billingState: result.school.billingState,
            },
            admin: {
              id: result.adminUser.id,
              name: result.adminUser.name,
              email: result.adminUser.email,
              mustChangePassword: true,
            },
            credentials: {
              schoolCode: result.school.schoolCode,
              email: result.adminUser.email,
              temporaryPassword: tempPassword,
            },
            emailStatus,
          })
        } catch (error: any) {
          failedSchools.push({
            schoolName: item?.schoolName || "",
            reason: error.message,
          })
        }
      }

      return res.status(201).json({
        message: "Bulk school onboarding completed",
        totalRequested: schools.length,
        totalCreated: createdSchools.length,
        totalFailed: failedSchools.length,
        createdSchools,
        failedSchools,
      })
    } catch (error: any) {
      console.error("BULK CREATE SCHOOL ERROR:", error)
      return res.status(500).json({
        message: "Failed to bulk onboard schools",
        error: error.message,
      })
    }
  }
)

router.get(
  "/schools",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (_req: AuthRequest, res: Response) => {
    try {
      const schools = await prisma.school.findMany({
        include: {
          billingState: true,
          users: {
            where: {
              role: "SCHOOL_ADMIN",
            },
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
              mustChangePassword: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json({
        schools,
      })
    } catch (error: any) {
      console.error("GET SCHOOLS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch schools",
        error: error.message,
      })
    }
  }
)

export default router