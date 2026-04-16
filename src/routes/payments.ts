import { Router } from "express"
import crypto from "crypto"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"
import { initializePaystackPayment, verifyPaystackPayment } from "../utils/paystack"
import { SUBSCRIPTION_PLANS, PlanKey } from "../config/subscriptionPlans"

const router = Router()

function generateReference(plan: string, schoolId: number) {
  return `EDU-${plan}-${schoolId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
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

router.post("/initialize", authMiddleware, async (req, res) => {
  try {
    const { schoolId, plan } = req.body as {
      schoolId: number
      plan: PlanKey
    }

    if (!schoolId || !plan) {
      return res.status(400).json({
        success: false,
        message: "schoolId and plan are required",
      })
    }

    const selectedPlan = SUBSCRIPTION_PLANS[plan]

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: Number(schoolId) },
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

    const reference = generateReference(plan, Number(schoolId))
    const amountInKobo = selectedPlan.amount * 100

    const paystackResponse = await initializePaystackPayment({
      email: school.email,
      amount: amountInKobo,
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        schoolId: school.id,
        schoolName: school.name,
        plan,
      },
    })

    const payment = await prisma.payment.create({
      data: {
        schoolId: school.id,
        plan,
        amount: selectedPlan.amount,
        currency: "NGN",
        reference,
        accessCode: paystackResponse.access_code,
        authorizationUrl: paystackResponse.authorization_url,
        status: "PENDING",
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
      message: error.message || "Failed to initialize payment",
    })
  }
})

router.get("/verify/:reference", authMiddleware, async (req, res) => {
  try {
    const { reference } = req.params

    const existingPayment = await prisma.payment.findUnique({
      where: { reference },
      include: { school: true },
    })

    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
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

    if (existingPayment.status === "SUCCESS") {
      return res.json({
        success: true,
        message: "Payment already verified",
        school: existingPayment.school,
      })
    }

    const planConfig = SUBSCRIPTION_PLANS[existingPayment.plan as PlanKey]
    const now = new Date()
    const subscriptionEnd = new Date(now)
    subscriptionEnd.setDate(subscriptionEnd.getDate() + planConfig.durationInDays)

    const [updatedPayment, updatedSchool] = await prisma.$transaction([
      prisma.payment.update({
        where: { reference },
        data: {
          status: "SUCCESS",
          paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
        },
      }),
      prisma.school.update({
        where: { id: existingPayment.schoolId },
        data: {
          subscriptionStatus: "active",
          subscriptionPlan: existingPayment.plan,
          subscriptionStart: now,
          subscriptionEnd,
        },
      }),
    ])

    return res.json({
      success: true,
      message: `${updatedSchool.name} upgraded to ${updatedSchool.subscriptionPlan} successfully`,
      payment: updatedPayment,
      school: updatedSchool,
    })
  } catch (error: any) {
    console.error("Verify payment error:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify payment",
    })
  }
})

router.get("/", authMiddleware, async (_req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
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