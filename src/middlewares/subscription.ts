import { Response, NextFunction } from "express"
import prisma from "../prisma"
import { AuthRequest } from "./auth"

type SchoolSubscriptionInfo = {
  id: number
  name: string
  plan: "NORMAL" | "PRO"
  billingCycle: string | null
  subscriptionStatus: string
  subscriptionStart: Date | null
  subscriptionEnd: Date | null
  nextBillingDate: Date | null
}

function isSuperAdmin(role?: string) {
  return role === "SUPER_ADMIN"
}

function isSchoolScoped(role?: string) {
  return (
    role === "SCHOOL_ADMIN" ||
    role === "TEACHER" ||
    role === "PARENT" ||
    role === "STUDENT"
  )
}

async function getSchoolForRequest(
  req: AuthRequest
): Promise<SchoolSubscriptionInfo | null> {
  if (!req.user?.schoolId) return null

  const school = await prisma.school.findUnique({
    where: { id: req.user.schoolId },
    select: {
      id: true,
      name: true,
      plan: true,
      billingCycle: true,
      subscriptionStatus: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      nextBillingDate: true,
    },
  })

  if (!school) return null

  return school as SchoolSubscriptionInfo
}

async function autoExpireIfNeeded(
  schoolId: number
): Promise<SchoolSubscriptionInfo | null> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      plan: true,
      billingCycle: true,
      subscriptionStatus: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      nextBillingDate: true,
    },
  })

  if (!school) return null

  const now = new Date()

  if (
    school.subscriptionEnd &&
    school.subscriptionEnd.getTime() < now.getTime() &&
    school.subscriptionStatus !== "expired"
  ) {
    const updatedSchool = await prisma.school.update({
      where: { id: schoolId },
      data: {
        subscriptionStatus: "expired",
        plan: "NORMAL",
      },
      select: {
        id: true,
        name: true,
        plan: true,
        billingCycle: true,
        subscriptionStatus: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        nextBillingDate: true,
      },
    })

    return updatedSchool as SchoolSubscriptionInfo
  }

  return school as SchoolSubscriptionInfo
}

async function resolveSchoolSubscription(
  req: AuthRequest
): Promise<SchoolSubscriptionInfo | null> {
  if (!req.user?.schoolId) return null
  return autoExpireIfNeeded(req.user.schoolId)
}

function buildInactiveSubscriptionResponse(school: SchoolSubscriptionInfo) {
  return {
    message: "Subscription inactive",
    code: "SUBSCRIPTION_INACTIVE",
    school: {
      id: school.id,
      name: school.name,
      plan: school.plan,
      billingCycle: school.billingCycle,
      subscriptionStatus: school.subscriptionStatus,
      subscriptionStart: school.subscriptionStart,
      subscriptionEnd: school.subscriptionEnd,
      nextBillingDate: school.nextBillingDate,
    },
  }
}

function buildPlanRequiredResponse(
  school: SchoolSubscriptionInfo,
  requiredPlan: "NORMAL" | "PRO"
) {
  return {
    message:
      requiredPlan === "PRO"
        ? "This feature requires PRO plan"
        : "This feature requires an active plan",
    code: requiredPlan === "PRO" ? "PRO_PLAN_REQUIRED" : "PLAN_REQUIRED",
    school: {
      id: school.id,
      name: school.name,
      plan: school.plan,
      billingCycle: school.billingCycle,
      subscriptionStatus: school.subscriptionStatus,
      subscriptionStart: school.subscriptionStart,
      subscriptionEnd: school.subscriptionEnd,
      nextBillingDate: school.nextBillingDate,
    },
  }
}

export const requireActiveSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Not authorized",
      })
    }

    if (isSuperAdmin(req.user.role)) {
      return next()
    }

    if (!isSchoolScoped(req.user.role)) {
      return res.status(403).json({
        message: "Access denied",
      })
    }

    if (!req.user.schoolId) {
      return res.status(403).json({
        message: "No school is attached to this account",
      })
    }

    const school = await resolveSchoolSubscription(req)

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    ;(req as any).schoolSubscription = school

    if (school.subscriptionStatus !== "active") {
      return res.status(403).json(buildInactiveSubscriptionResponse(school))
    }

    return next()
  } catch (error) {
    console.error("requireActiveSubscription error:", error)
    return res.status(500).json({
      message: "Failed to validate subscription",
    })
  }
}

export const requirePlan = (requiredPlan: "NORMAL" | "PRO") => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Not authorized",
        })
      }

      if (isSuperAdmin(req.user.role)) {
        return next()
      }

      if (!isSchoolScoped(req.user.role)) {
        return res.status(403).json({
          message: "Access denied",
        })
      }

      if (!req.user.schoolId) {
        return res.status(403).json({
          message: "No school is attached to this account",
        })
      }

      const school = await resolveSchoolSubscription(req)

      if (!school) {
        return res.status(404).json({
          message: "School not found",
        })
      }

      ;(req as any).schoolSubscription = school

      if (school.subscriptionStatus !== "active") {
        return res.status(403).json(buildInactiveSubscriptionResponse(school))
      }

      if (requiredPlan === "PRO" && school.plan !== "PRO") {
        return res.status(403).json(
          buildPlanRequiredResponse(school, requiredPlan)
        )
      }

      return next()
    } catch (error) {
      console.error("requirePlan error:", error)
      return res.status(500).json({
        message: "Failed to validate subscription plan",
      })
    }
  }
}

export const requireAnyPlan = (plans: Array<"NORMAL" | "PRO">) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Not authorized",
        })
      }

      if (isSuperAdmin(req.user.role)) {
        return next()
      }

      if (!isSchoolScoped(req.user.role)) {
        return res.status(403).json({
          message: "Access denied",
        })
      }

      if (!req.user.schoolId) {
        return res.status(403).json({
          message: "No school is attached to this account",
        })
      }

      const school = await resolveSchoolSubscription(req)

      if (!school) {
        return res.status(404).json({
          message: "School not found",
        })
      }

      ;(req as any).schoolSubscription = school

      if (school.subscriptionStatus !== "active") {
        return res.status(403).json(buildInactiveSubscriptionResponse(school))
      }

      if (!plans.includes(school.plan)) {
        return res.status(403).json({
          message: "Your current plan cannot access this feature",
          code: "PLAN_NOT_ALLOWED",
          school: {
            id: school.id,
            name: school.name,
            plan: school.plan,
            billingCycle: school.billingCycle,
            subscriptionStatus: school.subscriptionStatus,
            subscriptionStart: school.subscriptionStart,
            subscriptionEnd: school.subscriptionEnd,
            nextBillingDate: school.nextBillingDate,
          },
          allowedPlans: plans,
        })
      }

      return next()
    } catch (error) {
      console.error("requireAnyPlan error:", error)
      return res.status(500).json({
        message: "Failed to validate subscription plan",
      })
    }
  }
}

export const attachSchoolSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.schoolId) {
      ;(req as any).schoolSubscription = null
      return next()
    }

    const school = await getSchoolForRequest(req)

    ;(req as any).schoolSubscription = school || null

    return next()
  } catch (error) {
    console.error("attachSchoolSubscription error:", error)
    return res.status(500).json({
      message: "Failed to load school subscription",
    })
  }
}

export const requireSubscriptionContext = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Not authorized",
      })
    }

    if (isSuperAdmin(req.user.role)) {
      ;(req as any).schoolSubscription = null
      return next()
    }

    if (!req.user.schoolId) {
      return res.status(403).json({
        message: "No school is attached to this account",
      })
    }

    const school = await resolveSchoolSubscription(req)

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    ;(req as any).schoolSubscription = school

    return next()
  } catch (error) {
    console.error("requireSubscriptionContext error:", error)
    return res.status(500).json({
      message: "Failed to load subscription context",
    })
  }
}