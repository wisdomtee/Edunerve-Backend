import { Response, NextFunction } from "express"
import { AuthRequest } from "./auth.middleware"
import prisma from "../lib/prisma"

export const checkQuota = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user

    if (!user || !user.schoolId) {
      return res.status(401).json({ message: "Unauthorized or school not assigned" })
    }

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: {
        id: true,
        studentQuota: true,
        studentCount: true,
      }
    })

    if (!school) {
      return res.status(404).json({ message: "School not found" })
    }

    // studentQuota is nullable in your schema. If null, treat as unlimited.
    const quotaLimit = school.studentQuota ?? Infinity

    if (school.studentCount >= quotaLimit) {
      return res.status(403).json({
        message: "Student quota exceeded. Please upgrade your plan."
      })
    }

    next()
  } catch (error) {
    console.error("Quota check error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}