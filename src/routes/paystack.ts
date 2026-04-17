import express from "express"
import crypto from "crypto"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = express.Router()

type AuthUser = {
  id?: number
  role?: string
  schoolId?: number | null
  email?: string | null
  name?: string | null
}

type BillingCycle = "MONTHLY" | "YEARLY"
type PaymentMethod = "BANK" | "CARD" | "TRANSFER" | "CASH" | "OTHER"

function getUser(req: any): AuthUser | null {
  return (req.user as AuthUser) || null
}

function isSuperAdmin(user: AuthUser | null) {
  return user?.role === "SUPER_ADMIN"
}

function isSchoolAdmin(user: AuthUser | null) {
  return user?.role === "SCHOOL_ADMIN"
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const method = String(value || "CARD").trim().toUpperCase()

  if (method === "BANK") return "BANK"
  if (method === "CARD") return "CARD"
  if (method === "TRANSFER") return "TRANSFER"
  if (method === "CASH") return "CASH"

  return "OTHER"
}

function calculateNextSubscriptionEnd(
  startDate: Date,
  billingCycle: BillingCycle
) {
  const result = new Date(startDate)

  if (billingCycle === "YEARLY") {
    result.setFullYear(result.getFullYear() + 1)
    return result
  }

  result.setMonth(result.getMonth() + 1)
  return result
}

async function generateReceiptNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const startOfMonth = new Date(Date.UTC(year, now.getMonth(), 1, 0, 0, 0))

  const count = await prisma.receipt.count({
    where: {
      createdAt: {
        gte: startOfMonth,
      },
    },
  })

  const serial = String(count + 1).padStart(4, "0")
  return `RCPT-${year}${month}-${serial}`
}

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is missing")
  }

  return secretKey
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL || "http://localhost:3000"
}

async function paystackFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const secretKey = getPaystackSecretKey()

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || "Paystack request failed")
  }

  return data as T
}

async function applySuccessfulInvoicePayment(params: {
  invoiceId: number
  reference: string
  amountPaid?: number
  paidAt?: string | Date
  channel?: string
  notes?: string
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: {
      school: {
        include: {
          billingState: true,
        },
      },
      payments: true,
      receipt: true,
    },
  })

  if (!invoice) {
    throw new Error("Invoice not found")
  }

  if (invoice.status === "PAID") {
    return {
      alreadyPaid: true,
      invoice,
      payment: invoice.payments?.[0] || null,
      receipt: invoice.receipt || null,
      updatedBillingState: invoice.school?.billingState || null,
    }
  }

  const paidDate = params.paidAt ? new Date(params.paidAt) : new Date()
  const amountPaid = Math.max(
    toNumber(params.amountPaid, Number(invoice.total || invoice.amount)),
    0
  )

  if (amountPaid <= 0) {
    throw new Error("Invalid paid amount")
  }

  const billingCycle: BillingCycle =
    String(invoice.billingCycle).toUpperCase() === "YEARLY"
      ? "YEARLY"
      : "MONTHLY"

  const nextSubscriptionEnd = calculateNextSubscriptionEnd(
    paidDate,
    billingCycle
  )

  const normalizedBillingCycle =
    billingCycle === "YEARLY" ? "yearly" : "monthly"

  const receiptNumber = await generateReceiptNumber()

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: paidDate,
        paymentReference: params.reference,
      },
      include: {
        school: {
          include: {
            billingState: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },
        receipt: true,
      },
    })

    let payment = await tx.payment.findFirst({
      where: {
        invoiceId: invoice.id,
        reference: params.reference,
      },
    })

    if (!payment) {
      payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          schoolId: invoice.schoolId,
          plan: invoice.planType,
          amount: amountPaid,
          currency: "NGN",
          reference: params.reference,
          status: "SUCCESS",
          method: normalizePaymentMethod(params.channel || "CARD"),
          paidAt: paidDate,
          notes: params.notes || "Payment received via Paystack",
        },
      })
    }

    let receipt = await tx.receipt.findUnique({
      where: {
        invoiceId: invoice.id,
      },
    })

    if (!receipt) {
      receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          invoiceId: invoice.id,
          schoolId: invoice.schoolId,
          amount: amountPaid,
          paymentMethod: normalizePaymentMethod(params.channel || "CARD"),
          notes: params.notes || "Payment received via Paystack",
          status: "ISSUED",
          paymentDate: paidDate,
        },
      })
    }

    const updatedSchool = await tx.school.update({
      where: { id: invoice.schoolId },
      data: {
        plan: invoice.planType,
        subscriptionPlan: invoice.planType,
        subscriptionStatus: "active",
        subscriptionStart: paidDate,
        subscriptionEnd: nextSubscriptionEnd,
        nextBillingDate: nextSubscriptionEnd,
        billingCycle: normalizedBillingCycle,
      },
    })

    const existingBillingState = await tx.schoolBillingState.findUnique({
      where: { schoolId: invoice.schoolId },
    })

    let updatedBillingState = null

    if (existingBillingState) {
      updatedBillingState = await tx.schoolBillingState.update({
        where: { schoolId: invoice.schoolId },
        data: {
          plan: invoice.planType,
          status: "ACTIVE",
          amount: amountPaid,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          lastPaymentDate: paidDate,
          nextBillingDate: nextSubscriptionEnd,
          isAutoRenew: true,
          notes: "Updated from successful Paystack payment",
        },
      })
    } else {
      updatedBillingState = await tx.schoolBillingState.create({
        data: {
          schoolId: invoice.schoolId,
          plan: invoice.planType,
          status: "ACTIVE",
          amount: amountPaid,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          trialStartsAt: paidDate,
          trialEndsAt: null,
          lastPaymentDate: paidDate,
          nextBillingDate: nextSubscriptionEnd,
          isAutoRenew: true,
          notes: "Created from successful Paystack payment",
        },
      })
    }

    await tx.subscription.create({
      data: {
        schoolId: invoice.schoolId,
        plan: invoice.planType,
        status: "ACTIVE",
        startDate: paidDate,
        endDate: nextSubscriptionEnd,
        amount: amountPaid,
      },
    })

    return {
      updatedInvoice,
      payment,
      receipt,
      updatedSchool,
      updatedBillingState,
    }
  })

  return {
    alreadyPaid: false,
    ...result,
  }
}

/* =========================================
   INITIALIZE PAYSTACK PAYMENT
========================================= */
router.post("/initialize/:invoiceId", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)
    const invoiceId = toNumber(req.params.invoiceId)

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        school: true,
      },
    })

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (isSchoolAdmin(user) && Number(user.schoolId) !== invoice.schoolId) {
      return res.status(403).json({
        message: "You are not allowed to pay this invoice",
      })
    }

    if (!isSchoolAdmin(user) && !isSuperAdmin(user)) {
      return res.status(403).json({
        message: "You are not allowed to initialize this payment",
      })
    }

    if (invoice.status === "PAID") {
      return res.status(400).json({
        message: "Invoice is already paid",
      })
    }

    const amountKobo = Math.round(Number(invoice.total || invoice.amount) * 100)
    const reference = `INV-${invoice.id}-${Date.now()}`
    const callbackUrl = `${getFrontendBaseUrl()}/dashboard/school-admin/billing?paystack=success&reference=${encodeURIComponent(reference)}`

    const payload = {
      email: invoice.school?.email || user.email || "billing@edunerve.local",
      amount: amountKobo,
      reference,
      callback_url: callbackUrl,
      metadata: {
        invoiceId: invoice.id,
        schoolId: invoice.schoolId,
        source: "edunerve_school_admin_billing",
      },
    }

    const data = await paystackFetch<{
      status: boolean
      message: string
      data: {
        authorization_url: string
        access_code: string
        reference: string
      }
    }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify(payload),
    })

    return res.json({
      message: "Payment initialized successfully",
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    })
  } catch (error: any) {
    console.error("Initialize Paystack payment error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to initialize payment",
    })
  }
})

/* =========================================
   VERIFY PAYSTACK PAYMENT
========================================= */
router.get("/verify", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)
    const reference = String(req.query.reference || "").trim()

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!reference) {
      return res.status(400).json({
        message: "reference is required",
      })
    }

    const verification = await paystackFetch<{
      status: boolean
      message: string
      data: {
        reference: string
        amount: number
        status: string
        paid_at?: string
        channel?: string
        metadata?: {
          invoiceId?: number
          schoolId?: number
        }
      }
    }>(`/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
    })

    const tx = verification.data
    const invoiceId = toNumber(tx?.metadata?.invoiceId)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invoice metadata missing on payment",
      })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    })

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (isSchoolAdmin(user) && Number(user.schoolId) !== invoice.schoolId) {
      return res.status(403).json({
        message: "You are not allowed to verify this invoice",
      })
    }

    if (tx.status !== "success") {
      return res.status(400).json({
        message: "Payment is not successful yet",
        paymentStatus: tx.status,
      })
    }

    const result = await applySuccessfulInvoicePayment({
      invoiceId,
      reference: tx.reference,
      amountPaid: Number(tx.amount) / 100,
      paidAt: tx.paid_at,
      channel: tx.channel || "CARD",
      notes: "Verified from Paystack verification endpoint",
    })

    const invoiceResponse =
      "updatedInvoice" in result ? result.updatedInvoice : result.invoice

    return res.json({
      message: result.alreadyPaid
        ? "Payment already verified earlier"
        : "Payment verified successfully",
      invoice: invoiceResponse,
      payment: result.payment || null,
      receipt: result.receipt || null,
      billingState: result.updatedBillingState || null,
    })
  } catch (error: any) {
    console.error("Verify Paystack payment error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to verify payment",
    })
  }
})

/* =========================================
   PAYSTACK WEBHOOK
========================================= */
router.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY as string

    if (!secret) {
      return res.status(500).send("PAYSTACK_SECRET_KEY is missing")
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "")

    const signature = String(req.headers["x-paystack-signature"] || "")

    const hash = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex")

    if (hash !== signature) {
      return res.status(400).send("Invalid signature")
    }

    const event = JSON.parse(rawBody.toString("utf8"))

    res.sendStatus(200)

    if (event?.event !== "charge.success") {
      return
    }

    const data = event?.data
    const reference = String(data?.reference || "").trim()
    const invoiceId = toNumber(data?.metadata?.invoiceId)

    if (!reference || !invoiceId) {
      console.warn("Webhook missing reference or invoiceId")
      return
    }

    await applySuccessfulInvoicePayment({
      invoiceId,
      reference,
      amountPaid: Number(data?.amount || 0) / 100,
      paidAt: data?.paid_at,
      channel: data?.channel || "CARD",
      notes: "Processed from Paystack webhook charge.success",
    })

    console.log("Payment saved, invoice updated, and subscription activated")
  } catch (error) {
    console.error("Paystack webhook error:", error)
  }
})

export default router