import { Response, NextFunction } from "express"
import prisma from "../prisma"
import { AuthRequest } from "./auth"

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function normalizePlan(value: unknown) {
  return String(value || "").trim().toUpperCase()
}

export const requireActiveSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    // ✅ Super Admin should not be blocked by school subscription
    if (req.user.role === "SUPER_ADMIN") {
      return next()
    }

    if (!req.user.schoolId) {
      return res.status(403).json({
        message: "No school associated with this user",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId },
      select: {
        id: true,
        subscriptionStatus: true,
      },
    })

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    const status = normalizeStatus(school.subscriptionStatus)
    const allowedStatuses = ["active", "trial"]

    if (!allowedStatuses.includes(status)) {
      return res.status(403).json({
        message: "Subscription inactive. Please renew to continue.",
      })
    }

    return next()
  } catch (error) {
    console.error("SUBSCRIPTION CHECK ERROR:", error)
    return res.status(500).json({
      message: "Subscription validation failed",
    })
  }
}

export const requirePlan = (requiredPlan: "PRO" | "NORMAL") => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        })
      }

      // ✅ Super Admin can access all plan-locked features
      if (req.user.role === "SUPER_ADMIN") {
        return next()
      }

      if (!req.user.schoolId) {
        return res.status(403).json({
          message: "No school associated",
        })
      }

      const school = await prisma.school.findUnique({
        where: { id: req.user.schoolId },
        select: {
          id: true,
          plan: true,
        },
      })

      if (!school) {
        return res.status(404).json({
          message: "School not found",
        })
      }

      const currentPlan = normalizePlan(school.plan)
      const targetPlan = normalizePlan(requiredPlan)

      if (targetPlan === "PRO" && currentPlan !== "PRO") {
        return res.status(403).json({
          message: "This feature is only available on PRO plan",
        })
      }

      return next()
    } catch (error) {
      console.error("PLAN CHECK ERROR:", error)
      return res.status(500).json({
        message: "Plan validation failed",
      })
    }
  }
}