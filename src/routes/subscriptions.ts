import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addYears(date: Date, years: number) {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d
}

function calculateSubscriptionDates(
  billingCycle?: string | null,
  startDate?: Date
) {
  const start = startDate ? new Date(startDate) : new Date()
  const cycle = String(billingCycle || "monthly").toLowerCase()

  let end: Date

  if (cycle === "yearly") {
    end = addYears(start, 1)
  } else if (cycle === "termly") {
    end = addMonths(start, 3)
  } else {
    end = addMonths(start, 1)
  }

  return {
    start,
    end,
    nextBillingDate: new Date(end),
  }
}

// GET all school subscriptions
router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (_req: AuthRequest, res: Response) => {
    try {
      const schools = await prisma.school.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          plan: true,
          billingCycle: true,
          subscriptionStatus: true,
          subscriptionStart: true,
          subscriptionEnd: true,
          nextBillingDate: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json(schools)
    } catch (error: any) {
      console.error("GET SUBSCRIPTIONS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch subscriptions",
        error: error.message,
      })
    }
  }
)

// GET one school subscription
router.get(
  "/:schoolId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId = Number(req.params.schoolId)

      if (isNaN(schoolId)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          plan: true,
          billingCycle: true,
          subscriptionStatus: true,
          subscriptionStart: true,
          subscriptionEnd: true,
          nextBillingDate: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      return res.status(200).json(school)
    } catch (error: any) {
      console.error("GET SUBSCRIPTION ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch subscription",
        error: error.message,
      })
    }
  }
)

// UPDATE subscription manually
router.put(
  "/:schoolId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId = Number(req.params.schoolId)
      const {
        plan,
        subscriptionStatus,
        subscriptionStart,
        subscriptionEnd,
        billingCycle,
        nextBillingDate,
      } = req.body

      if (isNaN(schoolId)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      const normalizedPlan =
        plan !== undefined && plan !== null && String(plan).trim() !== ""
          ? String(plan).toUpperCase()
          : school.plan

      if (!["NORMAL", "PRO"].includes(String(normalizedPlan))) {
        return res.status(400).json({
          message: "Invalid plan. Use NORMAL or PRO",
        })
      }

      const normalizedBillingCycle =
        billingCycle !== undefined &&
        billingCycle !== null &&
        String(billingCycle).trim() !== ""
          ? String(billingCycle).toLowerCase()
          : school.billingCycle || "monthly"

      if (!["monthly", "termly", "yearly"].includes(normalizedBillingCycle)) {
        return res.status(400).json({
          message: "Invalid billingCycle. Use monthly, termly, or yearly",
        })
      }

      const updatedSchool = await prisma.school.update({
        where: { id: schoolId },
        data: {
          plan: normalizedPlan as "NORMAL" | "PRO",
          billingCycle: normalizedBillingCycle,
          subscriptionStatus:
            subscriptionStatus ?? school.subscriptionStatus,
          subscriptionStart: subscriptionStart
            ? new Date(subscriptionStart)
            : school.subscriptionStart,
          subscriptionEnd: subscriptionEnd
            ? new Date(subscriptionEnd)
            : school.subscriptionEnd,
          nextBillingDate: nextBillingDate
            ? new Date(nextBillingDate)
            : school.nextBillingDate,
        },
      })

      return res.status(200).json({
        message: "Subscription updated successfully",
        school: updatedSchool,
      })
    } catch (error: any) {
      console.error("UPDATE SUBSCRIPTION ERROR:", error)
      return res.status(500).json({
        message: "Failed to update subscription",
        error: error.message,
      })
    }
  }
)

// ACTIVATE NORMAL PLAN
router.patch(
  "/:schoolId/activate-normal",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId = Number(req.params.schoolId)
      const requestedBillingCycle = req.body?.billingCycle

      if (isNaN(schoolId)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      const billingCycle = requestedBillingCycle
        ? String(requestedBillingCycle).toLowerCase()
        : school.billingCycle || "monthly"

      if (!["monthly", "termly", "yearly"].includes(billingCycle)) {
        return res.status(400).json({
          message: "Invalid billingCycle. Use monthly, termly, or yearly",
        })
      }

      const { start, end, nextBillingDate } =
        calculateSubscriptionDates(billingCycle)

      const updatedSchool = await prisma.school.update({
        where: { id: schoolId },
        data: {
          plan: "NORMAL",
          billingCycle,
          subscriptionStatus: "active",
          subscriptionStart: start,
          subscriptionEnd: end,
          nextBillingDate,
        },
      })

      return res.status(200).json({
        message: "Normal plan activated successfully",
        school: updatedSchool,
      })
    } catch (error: any) {
      console.error("ACTIVATE NORMAL ERROR:", error)
      return res.status(500).json({
        message: "Failed to activate normal plan",
        error: error.message,
      })
    }
  }
)

// ACTIVATE PRO PLAN
router.patch(
  "/:schoolId/activate-pro",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId = Number(req.params.schoolId)
      const requestedBillingCycle = req.body?.billingCycle

      if (isNaN(schoolId)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      const billingCycle = requestedBillingCycle
        ? String(requestedBillingCycle).toLowerCase()
        : school.billingCycle || "monthly"

      if (!["monthly", "termly", "yearly"].includes(billingCycle)) {
        return res.status(400).json({
          message: "Invalid billingCycle. Use monthly, termly, or yearly",
        })
      }

      const { start, end, nextBillingDate } =
        calculateSubscriptionDates(billingCycle)

      const updatedSchool = await prisma.school.update({
        where: { id: schoolId },
        data: {
          plan: "PRO",
          billingCycle,
          subscriptionStatus: "active",
          subscriptionStart: start,
          subscriptionEnd: end,
          nextBillingDate,
        },
      })

      return res.status(200).json({
        message: "Pro plan activated successfully",
        school: updatedSchool,
      })
    } catch (error: any) {
      console.error("ACTIVATE PRO ERROR:", error)
      return res.status(500).json({
        message: "Failed to activate pro plan",
        error: error.message,
      })
    }
  }
)

// EXPIRE subscription
router.patch(
  "/:schoolId/expire",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolId = Number(req.params.schoolId)

      if (isNaN(schoolId)) {
        return res.status(400).json({ message: "Invalid school id" })
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
      })

      if (!school) {
        return res.status(404).json({ message: "School not found" })
      }

      const updatedSchool = await prisma.school.update({
        where: { id: schoolId },
        data: {
          subscriptionStatus: "expired",
          plan: "NORMAL",
        },
      })

      return res.status(200).json({
        message: "Subscription expired successfully",
        school: updatedSchool,
      })
    } catch (error: any) {
      console.error("EXPIRE SUBSCRIPTION ERROR:", error)
      return res.status(500).json({
        message: "Failed to expire subscription",
        error: error.message,
      })
    }
  }
)

export default router