import { Router } from "express"
import crypto from "crypto"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import {
  initializePaystackPayment,
  verifyPaystackPayment,
} from "../utils/paystack"
import { SUBSCRIPTION_PLANS, PlanKey } from "../config/subscriptionPlans"

const router = Router()

function generateReference(plan: string, schoolId: number) {
  return `EDU-${plan}-${schoolId}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")}`
}

router.get("/plans", authMiddleware, async (_req, res) => {
  try {
    return res.json({
      success: true,
      plans: Object.values(SUBSCRIPTION_PLANS),
    })
  } catch (error) {
    console.error("Get plans error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to fetch plans",
    })
  }
})

router.post("/initialize", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { schoolId, plan } = req.body as {
      schoolId: number
      plan: PlanKey
    }

    const normalizedSchoolId = Number(schoolId)
    const normalizedPlan = String(plan || "").trim() as PlanKey

    if (!normalizedSchoolId || !normalizedPlan) {
      return res.status(400).json({
        success: false,
        message: "schoolId and plan are required",
      })
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      })
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      Number(req.user.schoolId) !== normalizedSchoolId
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to initialize payment for this school",
      })
    }

    const selectedPlan = SUBSCRIPTION_PLANS[normalizedPlan]

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: normalizedSchoolId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      })
    }

    if (!school.email) {
      return res.status(400).json({
        success: false,
        message: "School must have an email before payment can be initialized",
      })
    }

    const reference = generateReference(normalizedPlan, normalizedSchoolId)
    const amountInKobo = Number(selectedPlan.amount) * 100

    const paystackResponse = await initializePaystackPayment({
      email: school.email,
      amount: amountInKobo,
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        schoolId: school.id,
        schoolName: school.name,
        plan: normalizedPlan,
      },
    })

    const invoice = await prisma.invoice.findFirst({
      where: {
        schoolId: school.id,
        planType: normalizedPlan,
        status: {
          in: ["PENDING", "OVERDUE"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    })

    if (!invoice) {
      return res.status(400).json({
        success: false,
        message:
          "No pending invoice found for this school and plan. Create an invoice first.",
      })
    }

    const payment = await prisma.payment.create({
      data: {
        invoice: {
          connect: { id: invoice.id },
        },
        school: {
          connect: { id: school.id },
        },
        plan: normalizedPlan,
        amount: Number(selectedPlan.amount),
        currency: "NGN",
        reference,
        accessCode: paystackResponse.access_code,
        authorizationUrl: paystackResponse.authorization_url,
        status: "PENDING",
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
          },
        },
      },
    })

    return res.json({
      success: true,
      message: "Payment initialized successfully",
      payment,
      authorizationUrl: paystackResponse.authorization_url,
      accessCode: paystackResponse.access_code,
      reference,
    })
  } catch (error: any) {
    console.error("Initialize payment error:", error)
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to initialize payment",
    })
  }
})

router.get(
  "/verify/:reference",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const reference = String(req.params.reference || "").trim()

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Payment reference is required",
        })
      }

      const existingPayment = await prisma.payment.findUnique({
        where: { reference },
        include: {
          school: true,
          invoice: true,
        },
      })

      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          message: "Payment record not found",
        })
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        })
      }

      if (
        req.user.role !== "SUPER_ADMIN" &&
        Number(req.user.schoolId) !== Number(existingPayment.schoolId)
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to verify payment for this school",
        })
      }

      if (existingPayment.status === "SUCCESS") {
        return res.json({
          success: true,
          message: "Payment already verified",
          payment: existingPayment,
          school: existingPayment.school,
          invoice: existingPayment.invoice,
        })
      }

      const verified = await verifyPaystackPayment(reference)

      if (verified.status !== "success") {
        await prisma.payment.update({
          where: { reference },
          data: {
            status: "FAILED",
          },
        })

        return res.status(400).json({
          success: false,
          message: "Payment not successful",
          paymentStatus: verified.status,
        })
      }

      const planConfig = SUBSCRIPTION_PLANS[existingPayment.plan as PlanKey]

      if (!planConfig) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment plan configuration",
        })
      }

      const now = new Date()
      const subscriptionEnd = new Date(now)
      subscriptionEnd.setDate(
        subscriptionEnd.getDate() + Number(planConfig.durationInDays)
      )

      const [updatedPayment, updatedSchool, updatedInvoice] =
        await prisma.$transaction([
          prisma.payment.update({
            where: { reference },
            data: {
              status: "SUCCESS",
              paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
            },
          }),
          prisma.school.update({
            where: { id: Number(existingPayment.schoolId) },
            data: {
              subscriptionStatus: "active",
              subscriptionPlan: existingPayment.plan,
              subscriptionStart: now,
              subscriptionEnd,
            },
          }),
          prisma.invoice.update({
            where: { id: existingPayment.invoiceId },
            data: {
              status: "PAID",
              paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
              paymentReference: reference,
            },
          }),
        ])

      return res.json({
        success: true,
        message: `${updatedSchool.name} upgraded to ${updatedSchool.subscriptionPlan} successfully`,
        payment: updatedPayment,
        school: updatedSchool,
        invoice: updatedInvoice,
      })
    } catch (error: any) {
      console.error("Verify payment error:", error)
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to verify payment",
      })
    }
  }
)

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      })
    }

    const whereClause =
      req.user.role === "SUPER_ADMIN"
        ? {}
        : {
            schoolId: Number(req.user.schoolId),
          }

    const payments = await prisma.payment.findMany({
      where: whereClause,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json({
      success: true,
      payments,
    })
  } catch (error) {
    console.error("Get payments error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
    })
  }
})

export default router