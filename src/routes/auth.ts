import { Router, Request, Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "../prisma"

const router = Router()

const normalizeEmail = (value: unknown): string => {
  return String(value || "").trim().toLowerCase()
}

const normalizePassword = (value: unknown): string => {
  return String(value || "").trim()
}

const normalizeSchoolCode = (value: unknown): string => {
  return String(value || "").trim().toUpperCase()
}

const toSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return "Unknown error"
}

// =======================
// LOGIN (UPDATED WITH SCHOOL CODE)
// =======================
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password, schoolCode } = req.body ?? {}

    const normalizedEmail = normalizeEmail(email)
    const normalizedPassword = normalizePassword(password)
    const normalizedSchoolCode = normalizeSchoolCode(schoolCode)

    if (!normalizedEmail || !normalizedPassword || !normalizedSchoolCode) {
      return res.status(400).json({
        message: "School code, email and password are required",
      })
    }

    console.log("🔐 LOGIN ATTEMPT")
    console.log("School Code:", normalizedSchoolCode)
    console.log("Email:", normalizedEmail)
    console.log("Database URL exists:", !!process.env.DATABASE_URL)
    console.log("JWT Secret exists:", !!process.env.JWT_SECRET)

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret is not configured",
      })
    }

    // 🔥 FIND SCHOOL FIRST
    const school = await prisma.school.findFirst({
      where: {
        schoolCode: normalizedSchoolCode,
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
      },
    })

    if (!school) {
      return res.status(404).json({
        message: "Invalid school code",
      })
    }

    console.log("School found:", school.name)

    // 🔥 FIND USER WITH SCHOOL ID
    // We avoid `mode: "insensitive"` here to reduce production Prisma issues.
    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        schoolId: school.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        schoolId: true,
        mustChangePassword: true,
      },
    })

    console.log("User found:", user ? user.email : null)

    if (!user) {
      return res.status(404).json({
        message: "User not found in this school",
      })
    }

    if (!user.password) {
      console.error("LOGIN ERROR: User has no password hash stored")
      return res.status(500).json({
        message: "User password is not configured",
      })
    }

    const isPasswordValid = await bcrypt.compare(
      normalizedPassword,
      user.password
    )

    console.log("Password valid:", isPasswordValid)

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      })
    }

    const tokenPayload = {
      id: Number(user.id),
      role: String(user.role),
      schoolId:
        user.schoolId !== null && user.schoolId !== undefined
          ? Number(user.schoolId)
          : null,
      email: user.email,
      name: user.name,
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    })

    let linkedStudent: { id: number; name: string } | null = null

    // =======================
    // PARENT LINKING
    // =======================
    if (String(user.role).toUpperCase() === "PARENT") {
      try {
        const parent = await prisma.parent.findFirst({
          where: {
            userId: user.id,
          },
          include: {
            students: {
              select: {
                id: true,
                name: true,
              },
              orderBy: {
                id: "asc",
              },
            },
          },
        })

        console.log("Parent profile found:", !!parent)
        console.log("Linked students count:", parent?.students?.length || 0)

        if (parent && Array.isArray(parent.students) && parent.students.length > 0) {
          linkedStudent = {
            id: Number(parent.students[0].id),
            name: parent.students[0].name,
          }
        }
      } catch (parentError) {
        console.error("PARENT LINK ERROR:", parentError)
      }
    }

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId:
          user.schoolId !== null && user.schoolId !== undefined
            ? Number(user.schoolId)
            : null,
        mustChangePassword: Boolean(user.mustChangePassword),
        school: {
          id: Number(school.id),
          name: school.name,
          schoolCode: school.schoolCode,
        },
      },
      linkedStudent,
    })
  } catch (error: unknown) {
    console.error("LOGIN ERROR:", error)

    return res.status(500).json({
      message: "Server error",
      error: toSafeErrorMessage(error),
    })
  }
})

// =======================
// CHANGE PASSWORD
// =======================
router.post("/change-password", async (req: Request, res: Response) => {
  try {
    const { email, schoolCode, currentPassword, newPassword } = req.body ?? {}

    const normalizedEmail = normalizeEmail(email)
    const normalizedCurrentPassword = normalizePassword(currentPassword)
    const normalizedNewPassword = normalizePassword(newPassword)
    const normalizedSchoolCode = normalizeSchoolCode(schoolCode)

    if (
      !normalizedEmail ||
      !normalizedCurrentPassword ||
      !normalizedNewPassword ||
      !normalizedSchoolCode
    ) {
      return res.status(400).json({
        message:
          "School code, email, currentPassword and newPassword are required",
      })
    }

    if (normalizedNewPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      })
    }

    const school = await prisma.school.findFirst({
      where: {
        schoolCode: normalizedSchoolCode,
      },
      select: {
        id: true,
      },
    })

    if (!school) {
      return res.status(404).json({
        message: "Invalid school code",
      })
    }

    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        schoolId: school.id,
      },
      select: {
        id: true,
        password: true,
      },
    })

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      })
    }

    if (!user.password) {
      return res.status(500).json({
        message: "User password is not configured",
      })
    }

    const isPasswordValid = await bcrypt.compare(
      normalizedCurrentPassword,
      user.password
    )

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Current password is incorrect",
      })
    }

    const hashedPassword = await bcrypt.hash(normalizedNewPassword, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    })

    return res.status(200).json({
      message: "Password changed successfully",
    })
  } catch (error: unknown) {
    console.error("CHANGE PASSWORD ERROR:", error)

    return res.status(500).json({
      message: "Failed to change password",
      error: toSafeErrorMessage(error),
    })
  }
})

// =======================
// DEBUG SCHOOLS
// =======================
router.get("/debug/schools", async (_req: Request, res: Response) => {
  try {
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        schoolCode: true,
      },
      orderBy: {
        id: "asc",
      },
    })

    return res.status(200).json(schools)
  } catch (error: unknown) {
    console.error("DEBUG SCHOOLS ERROR:", error)

    return res.status(500).json({
      message: "Error fetching schools",
      error: toSafeErrorMessage(error),
    })
  }
})

export default router