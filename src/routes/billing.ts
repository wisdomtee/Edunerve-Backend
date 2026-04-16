import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"
import { generateReceiptPdfBuffer } from "../utils/receiptPdf"

const router = Router()

type AuthUser = {
  id?: number
  role?: string
  schoolId?: number | null
}

type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED"
type BillingCycle = "MONTHLY" | "YEARLY"
type PlanType = "NORMAL" | "PRO"
type PaymentMethod = "BANK" | "CARD" | "TRANSFER" | "CASH" | "OTHER"
type PaymentStatus = "PENDING" | "PAID" | "SUCCESS" | "FAILED" | "CANCELLED"

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

function safeUpper(value: unknown, fallback = "") {
  return String(value || fallback).trim().toUpperCase()
}

function normalizePlan(value: unknown): PlanType {
  const plan = safeUpper(value, "NORMAL")
  return plan === "PRO" ? "PRO" : "NORMAL"
}

function normalizeBillingCycle(value: unknown): BillingCycle {
  const cycle = safeUpper(value, "MONTHLY")
  return cycle === "YEARLY" ? "YEARLY" : "MONTHLY"
}

function normalizeInvoiceStatus(value: unknown): InvoiceStatus {
  const status = safeUpper(value, "PENDING")
  if (status === "PAID") return "PAID"
  if (status === "OVERDUE") return "OVERDUE"
  if (status === "CANCELLED") return "CANCELLED"
  return "PENDING"
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const method = safeUpper(value, "OTHER")
  if (method === "BANK") return "BANK"
  if (method === "CARD") return "CARD"
  if (method === "TRANSFER") return "TRANSFER"
  if (method === "CASH") return "CASH"
  return "OTHER"
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  const status = safeUpper(value, "SUCCESS")
  if (status === "PENDING") return "PENDING"
  if (status === "PAID") return "PAID"
  if (status === "FAILED") return "FAILED"
  if (status === "CANCELLED") return "CANCELLED"
  return "SUCCESS"
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
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

function calculateInvoiceTotals({
  amount,
  tax,
  discount,
}: {
  amount: number
  tax?: number
  discount?: number
}) {
  const baseAmount = Math.max(toNumber(amount), 0)
  const taxAmount = Math.max(toNumber(tax), 0)
  const discountAmount = Math.max(toNumber(discount), 0)
  const total = Math.max(baseAmount + taxAmount - discountAmount, 0)

  return {
    amount: baseAmount,
    tax: taxAmount,
    discount: discountAmount,
    total,
  }
}

async function generateInvoiceNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const startOfMonth = new Date(Date.UTC(year, now.getMonth(), 1, 0, 0, 0))

  const count = await prisma.invoice.count({
    where: {
      createdAt: {
        gte: startOfMonth,
      },
    },
  })

  const serial = String(count + 1).padStart(4, "0")
  return `INV-${year}${month}-${serial}`
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

async function markInvoiceAsPaid(invoiceId: number, payload: any) {
  const { method, reference, amount, paidAt, notes } = payload || {}

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
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
    return {
      ok: false,
      status: 404,
      body: { message: "Invoice not found" },
    }
  }

  if (invoice.status === "PAID") {
    return {
      ok: false,
      status: 400,
      body: { message: "Invoice is already marked as paid" },
    }
  }

  const paymentAmount = toNumber(amount || invoice.total || invoice.amount)

  if (paymentAmount <= 0) {
    return {
      ok: false,
      status: 400,
      body: { message: "Payment amount must be greater than 0" },
    }
  }

  if (!reference || !String(reference).trim()) {
    return {
      ok: false,
      status: 400,
      body: { message: "Payment reference is required" },
    }
  }

  const paidDate = paidAt ? new Date(paidAt) : new Date()

  const nextSubscriptionEnd = calculateNextSubscriptionEnd(
    paidDate,
    invoice.billingCycle as BillingCycle
  )

  const normalizedBillingCycle =
    String(invoice.billingCycle).toUpperCase() === "YEARLY"
      ? "yearly"
      : "monthly"

  const receiptNumber = await generateReceiptNumber()

  const result = await prisma.$transaction(async (tx) => {
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidAt: paidDate,
        paymentReference: String(reference).trim(),
      },
      include: {
        school: true,
        payments: true,
        receipt: true,
      },
    })

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        schoolId: invoice.schoolId,
        plan: invoice.planType,
        amount: paymentAmount,
        currency: "NGN",
        reference: String(reference).trim(),
        status: normalizePaymentStatus("SUCCESS"),
        method: normalizePaymentMethod(method || "TRANSFER"),
        paidAt: paidDate,
        notes: notes ? String(notes).trim() : null,
      },
    })

    const receipt = await tx.receipt.create({
      data: {
        receiptNumber,
        invoiceId: invoice.id,
        schoolId: invoice.schoolId,
        amount: paymentAmount,
        paymentMethod: normalizePaymentMethod(method || "TRANSFER"),
        notes: notes ? String(notes).trim() : "Payment received successfully",
        status: "ISSUED",
        paymentDate: paidDate,
      },
    })

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
          amount: paymentAmount,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          lastPaymentDate: paidDate,
          nextBillingDate: nextSubscriptionEnd,
          isAutoRenew: true,
          notes: notes
            ? String(notes).trim()
            : "Invoice payment recorded successfully",
        },
      })
    } else {
      updatedBillingState = await tx.schoolBillingState.create({
        data: {
          schoolId: invoice.schoolId,
          plan: invoice.planType,
          status: "ACTIVE",
          amount: paymentAmount,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          trialStartsAt: paidDate,
          trialEndsAt: null,
          lastPaymentDate: paidDate,
          nextBillingDate: nextSubscriptionEnd,
          isAutoRenew: true,
          notes: notes
            ? String(notes).trim()
            : "Billing state created from successful invoice payment",
        },
      })
    }

    return {
      updatedInvoice,
      payment,
      receipt,
      updatedSchool,
      updatedBillingState,
      originalInvoice: invoice,
      paidDate,
      paymentAmount,
      method: normalizePaymentMethod(method || "TRANSFER"),
      reference: String(reference).trim(),
      notes: notes ? String(notes).trim() : "Payment received successfully.",
    }
  })

  const receiptBuffer = await generateReceiptPdfBuffer({
    receiptNumber: result.receipt.receiptNumber,
    invoiceNumber: result.originalInvoice.invoiceNumber,
    paymentReference: result.reference,
    paymentMethod: result.method,
    amountPaid: result.paymentAmount,
    paidAt: result.paidDate.toISOString(),
    from: {
      name: "EduNerve",
      email: "billing@edunerve.com",
      address: "Lagos, Nigeria",
    },
    to: {
      name: result.originalInvoice.school.name,
      email: result.originalInvoice.school.email || "",
    },
    notes: result.notes,
  })

  return {
    ok: true,
    status: 200,
    body: {
      message: "Invoice marked as paid successfully",
      invoice: result.updatedInvoice,
      payment: result.payment,
      receiptRecord: result.receipt,
      school: result.updatedSchool,
      billingState: result.updatedBillingState,
      receipt: {
        fileName: `receipt-${result.originalInvoice.invoiceNumber}.pdf`,
        mimeType: "application/pdf",
        base64: receiptBuffer.toString("base64"),
      },
    },
  }
}

async function markInvoiceAsOverdue(invoiceId: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  })

  if (!invoice) {
    return {
      ok: false,
      status: 404,
      body: { message: "Invoice not found" },
    }
  }

  if (invoice.status === "PAID") {
    return {
      ok: false,
      status: 400,
      body: { message: "Paid invoice cannot be marked overdue" },
    }
  }

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "OVERDUE",
    },
    include: {
      school: true,
      payments: true,
      receipt: true,
    },
  })

  await prisma.schoolBillingState.updateMany({
    where: {
      schoolId: updatedInvoice.schoolId,
    },
    data: {
      status: "PAST_DUE",
    },
  })

  return {
    ok: true,
    status: 200,
    body: {
      message: "Invoice marked as overdue successfully",
      invoice: updatedInvoice,
    },
  }
}

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    if (isSuperAdmin(user)) {
      const [
        totalInvoices,
        pendingInvoices,
        paidInvoices,
        overdueInvoices,
        totalRevenueAgg,
        activeSchools,
        expiredSchools,
        trialSchools,
      ] = await Promise.all([
        prisma.invoice.count(),
        prisma.invoice.count({ where: { status: "PENDING" } }),
        prisma.invoice.count({ where: { status: "PAID" } }),
        prisma.invoice.count({ where: { status: "OVERDUE" } }),
        prisma.invoice.aggregate({
          _sum: { total: true },
          where: { status: "PAID" },
        }),
        prisma.school.count({
          where: { subscriptionStatus: "active" },
        }),
        prisma.school.count({
          where: { subscriptionStatus: "expired" },
        }),
        prisma.schoolBillingState.count({
          where: { status: "TRIAL" },
        }),
      ])

      return res.json({
        message: "Billing summary fetched successfully",
        scope: "global",
        stats: {
          totalInvoices,
          pendingInvoices,
          paidInvoices,
          overdueInvoices,
          totalRevenue: Number(totalRevenueAgg._sum.total || 0),
          activeSchools,
          expiredSchools,
          trialSchools,
        },
      })
    }

    if (!user.schoolId) {
      return res.status(400).json({
        message: "No school is attached to this user",
      })
    }

    const schoolId = Number(user.schoolId)

    const [
      totalInvoices,
      pendingInvoices,
      paidInvoices,
      overdueInvoices,
      totalPaidAgg,
      school,
      billingState,
    ] = await Promise.all([
      prisma.invoice.count({ where: { schoolId } }),
      prisma.invoice.count({ where: { schoolId, status: "PENDING" } }),
      prisma.invoice.count({ where: { schoolId, status: "PAID" } }),
      prisma.invoice.count({ where: { schoolId, status: "OVERDUE" } }),
      prisma.invoice.aggregate({
        _sum: { total: true },
        where: { schoolId, status: "PAID" },
      }),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          plan: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
          nextBillingDate: true,
        },
      }),
      prisma.schoolBillingState.findUnique({
        where: { schoolId },
      }),
    ])

    return res.json({
      message: "Billing summary fetched successfully",
      scope: "school",
      school,
      billingState,
      stats: {
        totalInvoices,
        pendingInvoices,
        paidInvoices,
        overdueInvoices,
        totalPaid: Number(totalPaidAgg._sum.total || 0),
      },
    })
  } catch (error) {
    console.error("Get billing summary error:", error)
    return res.status(500).json({
      message: "Failed to fetch billing summary",
    })
  }
})

router.post("/invoices", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can create invoices",
      })
    }

    const {
      schoolId,
      amount,
      tax,
      discount,
      dueDate,
      plan,
      billingCycle,
      paymentReference,
      status,
      description,
    } = req.body

    const parsedSchoolId = toNumber(schoolId)

    if (!parsedSchoolId) {
      return res.status(400).json({
        message: "schoolId is required",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: parsedSchoolId },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
      },
    })

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    const totals = calculateInvoiceTotals({
      amount: toNumber(amount),
      tax: toNumber(tax),
      discount: toNumber(discount),
    })

    if (totals.amount <= 0) {
      return res.status(400).json({
        message: "amount must be greater than 0",
      })
    }

    const invoiceNumber = await generateInvoiceNumber()

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        schoolId: parsedSchoolId,
        amount: totals.amount,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        description: description ? String(description).trim() : null,
        status: normalizeInvoiceStatus(status || "PENDING"),
        planType: normalizePlan(plan || school.plan || "NORMAL"),
        billingCycle: normalizeBillingCycle(billingCycle || "MONTHLY"),
        dueDate: dueDate ? new Date(dueDate) : addDays(new Date(), 7),
        paymentReference: paymentReference
          ? String(paymentReference).trim()
          : null,
      },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            email: true,
            plan: true,
            subscriptionStatus: true,
            subscriptionEnd: true,
          },
        },
        payments: true,
      },
    })

    return res.status(201).json({
      message: "Invoice created successfully",
      invoice,
    })
  } catch (error) {
    console.error("Create invoice error:", error)
    return res.status(500).json({
      message: "Failed to create invoice",
    })
  }
})

router.get("/invoices", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const page = Math.max(toNumber(req.query.page, 1), 1)
    const limit = Math.min(Math.max(toNumber(req.query.limit, 10), 1), 100)
    const skip = (page - 1) * limit

    const search = String(req.query.search || "").trim()
    const status = String(req.query.status || "").trim().toUpperCase()
    const plan = String(req.query.plan || "").trim().toUpperCase()
    const schoolIdQuery = toNumber(req.query.schoolId)

    const where: any = {}

    if (search) {
      where.OR = [
        {
          invoiceNumber: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          paymentReference: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          school: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ]
    }

    if (status) {
      where.status = status
    }

    if (plan) {
      where.planType = plan
    }

    if (isSchoolAdmin(user)) {
      if (!user.schoolId) {
        return res.status(400).json({
          message: "No school is attached to this user",
        })
      }

      where.schoolId = Number(user.schoolId)
    } else if (schoolIdQuery) {
      where.schoolId = schoolIdQuery
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        include: {
          school: {
            select: {
              id: true,
              name: true,
              email: true,
              plan: true,
              subscriptionStatus: true,
              subscriptionEnd: true,
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
      }),
      prisma.invoice.count({ where }),
    ])

    return res.json({
      message: "Invoices fetched successfully",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      invoices,
    })
  } catch (error) {
    console.error("Get invoices error:", error)
    return res.status(500).json({
      message: "Failed to fetch invoices",
    })
  }
})

router.get("/invoices/:id", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)
    const invoiceId = toNumber(req.params.id)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
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

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (isSchoolAdmin(user) && Number(user?.schoolId) !== invoice.schoolId) {
      return res.status(403).json({
        message: "You are not allowed to view this invoice",
      })
    }

    return res.json({
      message: "Invoice fetched successfully",
      invoice,
    })
  } catch (error) {
    console.error("Get invoice by id error:", error)
    return res.status(500).json({
      message: "Failed to fetch invoice",
    })
  }
})

router.patch("/invoices/:id", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can update invoices",
      })
    }

    const invoiceId = toNumber(req.params.id)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    })

    if (!existingInvoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    const {
      amount,
      tax,
      discount,
      dueDate,
      plan,
      billingCycle,
      paymentReference,
      status,
      description,
    } = req.body

    const nextAmount =
      amount !== undefined ? toNumber(amount) : Number(existingInvoice.amount)

    const nextTax =
      tax !== undefined ? toNumber(tax) : Number(existingInvoice.tax || 0)

    const nextDiscount =
      discount !== undefined
        ? toNumber(discount)
        : Number(existingInvoice.discount || 0)

    const totals = calculateInvoiceTotals({
      amount: nextAmount,
      tax: nextTax,
      discount: nextDiscount,
    })

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amount: totals.amount,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        dueDate:
          dueDate !== undefined
            ? dueDate
              ? new Date(dueDate)
              : null
            : existingInvoice.dueDate,
        planType:
          plan !== undefined
            ? normalizePlan(plan)
            : existingInvoice.planType,
        billingCycle:
          billingCycle !== undefined
            ? normalizeBillingCycle(billingCycle)
            : (existingInvoice.billingCycle as BillingCycle),
        paymentReference:
          paymentReference !== undefined
            ? paymentReference
              ? String(paymentReference).trim()
              : null
            : existingInvoice.paymentReference,
        status:
          status !== undefined
            ? normalizeInvoiceStatus(status)
            : existingInvoice.status,
        description:
          description !== undefined
            ? description
              ? String(description).trim()
              : null
            : existingInvoice.description,
      },
      include: {
        school: true,
        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },
        receipt: true,
      },
    })

    return res.json({
      message: "Invoice updated successfully",
      invoice: updatedInvoice,
    })
  } catch (error) {
    console.error("Update invoice error:", error)
    return res.status(500).json({
      message: "Failed to update invoice",
    })
  }
})

router.patch("/invoices/:id/status", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can update invoice status",
      })
    }

    const invoiceId = toNumber(req.params.id)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const status = safeUpper(req.body?.status)

    if (!status) {
      return res.status(400).json({
        message: "status is required",
      })
    }

    if (status === "PAID") {
      const result = await markInvoiceAsPaid(invoiceId, req.body)
      return res.status(result.status).json(result.body)
    }

    if (status === "OVERDUE") {
      const result = await markInvoiceAsOverdue(invoiceId)
      return res.status(result.status).json(result.body)
    }

    if (status === "PENDING" || status === "CANCELLED") {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      })

      if (!invoice) {
        return res.status(404).json({
          message: "Invoice not found",
        })
      }

      if (invoice.status === "PAID" && status !== "PAID") {
        return res.status(400).json({
          message: "Paid invoice cannot be changed to this status from this route",
        })
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: normalizeInvoiceStatus(status),
        },
        include: {
          school: true,
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
          receipt: true,
        },
      })

      return res.json({
        message: `Invoice marked as ${normalizeInvoiceStatus(status).toLowerCase()} successfully`,
        invoice: updatedInvoice,
      })
    }

    return res.status(400).json({
      message: "Unsupported status. Use PAID, OVERDUE, PENDING, or CANCELLED",
    })
  } catch (error) {
    console.error("Update invoice status error:", error)
    return res.status(500).json({
      message: "Failed to update invoice status",
    })
  }
})

router.patch("/invoices/:id/mark-paid", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can mark invoice as paid",
      })
    }

    const invoiceId = toNumber(req.params.id)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const result = await markInvoiceAsPaid(invoiceId, req.body)
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error("Mark invoice as paid error:", error)
    return res.status(500).json({
      message: "Failed to mark invoice as paid",
    })
  }
})

router.patch("/invoices/:id/mark-overdue", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can mark invoice as overdue",
      })
    }

    const invoiceId = toNumber(req.params.id)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const result = await markInvoiceAsOverdue(invoiceId)
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error("Mark invoice overdue error:", error)
    return res.status(500).json({
      message: "Failed to mark invoice as overdue",
    })
  }
})

router.get("/payments", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const page = Math.max(toNumber(req.query.page, 1), 1)
    const limit = Math.min(Math.max(toNumber(req.query.limit, 10), 1), 100)
    const skip = (page - 1) * limit
    const search = String(req.query.search || "").trim()

    const where: any = {}

    if (search) {
      where.OR = [
        {
          reference: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          invoice: {
            invoiceNumber: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          invoice: {
            school: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
      ]
    }

    if (isSchoolAdmin(user)) {
      if (!user.schoolId) {
        return res.status(400).json({
          message: "No school is attached to this user",
        })
      }

      where.schoolId = Number(user.schoolId)
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            include: {
              school: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ])

    return res.json({
      message: "Payments fetched successfully",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      payments,
    })
  } catch (error) {
    console.error("Get payments error:", error)
    return res.status(500).json({
      message: "Failed to fetch payments",
    })
  }
})

router.get("/receipts/:invoiceId/pdf", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)
    const invoiceId = toNumber(req.params.invoiceId)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Invalid invoice id",
      })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        school: true,
        receipt: true,
      },
    })

    if (!invoice || !invoice.receipt) {
      return res.status(404).json({
        message: "Receipt not found",
      })
    }

    if (isSchoolAdmin(user) && Number(user?.schoolId) !== invoice.schoolId) {
      return res.status(403).json({
        message: "You are not allowed to view this receipt",
      })
    }

    const receiptBuffer = await generateReceiptPdfBuffer({
      receiptNumber: invoice.receipt.receiptNumber,
      invoiceNumber: invoice.invoiceNumber,
      paymentReference: invoice.paymentReference || "N/A",
      paymentMethod: invoice.receipt.paymentMethod || "TRANSFER",
      amountPaid: Number(invoice.receipt.amount),
      paidAt: invoice.receipt.paymentDate.toISOString(),
      from: {
        name: "EduNerve",
        email: "billing@edunerve.com",
        address: "Lagos, Nigeria",
      },
      to: {
        name: invoice.school.name,
        email: invoice.school.email || "",
      },
      notes: invoice.receipt.notes || "Payment received successfully.",
    })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoice.receipt.receiptNumber}.pdf"`
    )

    return res.send(receiptBuffer)
  } catch (error) {
    console.error("Download receipt pdf error:", error)
    return res.status(500).json({
      message: "Failed to download receipt PDF",
    })
  }
})

router.post("/run-expiry-check", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can run expiry checks",
      })
    }

    const now = new Date()

    const schoolUpdateResult = await prisma.school.updateMany({
      where: {
        subscriptionEnd: {
          lt: now,
        },
        subscriptionStatus: {
          not: "expired",
        },
      },
      data: {
        subscriptionStatus: "expired",
        plan: "NORMAL",
        subscriptionPlan: "NORMAL",
      },
    })

    await prisma.schoolBillingState.updateMany({
      where: {
        nextBillingDate: {
          lt: now,
        },
        status: {
          not: "SUSPENDED",
        },
      },
      data: {
        status: "SUSPENDED",
      },
    })

    await prisma.invoice.updateMany({
      where: {
        status: "PENDING",
        dueDate: {
          lt: now,
        },
      },
      data: {
        status: "OVERDUE",
      },
    })

    return res.json({
      message: "Expiry check completed successfully",
      updatedSchools: schoolUpdateResult.count,
    })
  } catch (error) {
    console.error("Run expiry check error:", error)
    return res.status(500).json({
      message: "Failed to run expiry check",
    })
  }
})

router.patch("/schools/:schoolId/upgrade", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can upgrade plans",
      })
    }

    const schoolId = toNumber(req.params.schoolId)
    const requestedCycle = normalizeBillingCycle(req.body?.billingCycle || "MONTHLY")
    const amount = toNumber(req.body?.amount, 0)
    const now = new Date()
    const nextEnd = calculateNextSubscriptionEnd(now, requestedCycle)
    const normalizedBillingCycle = requestedCycle === "YEARLY" ? "yearly" : "monthly"

    if (!schoolId) {
      return res.status(400).json({ message: "Invalid schoolId" })
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        billingState: true,
      },
    })

    if (!school) {
      return res.status(404).json({ message: "School not found" })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedSchool = await tx.school.update({
        where: { id: schoolId },
        data: {
          plan: "PRO",
          subscriptionPlan: "PRO",
          subscriptionStatus: "active",
          subscriptionStart: now,
          subscriptionEnd: nextEnd,
          nextBillingDate: nextEnd,
          billingCycle: normalizedBillingCycle,
        },
      })

      const billingState = await tx.schoolBillingState.upsert({
        where: { schoolId },
        update: {
          plan: "PRO",
          status: "ACTIVE",
          amount:
            amount > 0
              ? amount
              : school.billingState?.amount || 0,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          lastPaymentDate: now,
          nextBillingDate: nextEnd,
          isAutoRenew: true,
          notes: "School upgraded to PRO by super admin",
        },
        create: {
          schoolId,
          plan: "PRO",
          status: "ACTIVE",
          amount,
          currency: "NGN",
          billingCycle: normalizedBillingCycle,
          trialStartsAt: now,
          trialEndsAt: null,
          lastPaymentDate: now,
          nextBillingDate: nextEnd,
          isAutoRenew: true,
          notes: "School upgraded to PRO by super admin",
        },
      })

      await tx.subscription.create({
        data: {
          schoolId,
          plan: "PRO",
          status: "ACTIVE",
          startDate: now,
          endDate: nextEnd,
          amount:
            amount > 0
              ? amount
              : school.billingState?.amount || 0,
        },
      })

      return { updatedSchool, billingState }
    })

    return res.json({
      message: "School upgraded to PRO successfully",
      school: result.updatedSchool,
      billingState: result.billingState,
    })
  } catch (error) {
    console.error("Upgrade plan error:", error)
    return res.status(500).json({
      message: "Failed to upgrade plan",
    })
  }
})

router.patch("/schools/:schoolId/downgrade", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can downgrade plans",
      })
    }

    const schoolId = toNumber(req.params.schoolId)

    if (!schoolId) {
      return res.status(400).json({ message: "Invalid schoolId" })
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        billingState: true,
      },
    })

    if (!school) {
      return res.status(404).json({ message: "School not found" })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedSchool = await tx.school.update({
        where: { id: schoolId },
        data: {
          plan: "NORMAL",
          subscriptionPlan: "NORMAL",
          subscriptionStatus: "active",
        },
      })

      const billingState = await tx.schoolBillingState.upsert({
        where: { schoolId },
        update: {
          plan: "NORMAL",
          status: "ACTIVE",
          isAutoRenew: false,
          notes: "School downgraded to NORMAL by super admin",
        },
        create: {
          schoolId,
          plan: "NORMAL",
          status: "ACTIVE",
          amount: 0,
          currency: "NGN",
          billingCycle: "monthly",
          trialStartsAt: new Date(),
          isAutoRenew: false,
          notes: "School downgraded to NORMAL by super admin",
        },
      })

      await tx.subscription.create({
        data: {
          schoolId,
          plan: "NORMAL",
          status: "ACTIVE",
          startDate: new Date(),
          endDate: school.subscriptionEnd || addDays(new Date(), 30),
          amount: 0,
        },
      })

      return { updatedSchool, billingState }
    })

    return res.json({
      message: "School downgraded to NORMAL",
      school: result.updatedSchool,
      billingState: result.billingState,
    })
  } catch (error) {
    console.error("Downgrade error:", error)
    return res.status(500).json({
      message: "Failed to downgrade plan",
    })
  }
})

router.patch(
  "/schools/:schoolId/toggle-auto-renew",
  authMiddleware,
  async (req, res) => {
    try {
      const user = getUser(req)

      if (!isSuperAdmin(user)) {
        return res.status(403).json({
          message: "Only super admin can update auto renew",
        })
      }

      const schoolId = toNumber(req.params.schoolId)

      if (!schoolId) {
        return res.status(400).json({ message: "Invalid schoolId" })
      }

      const billingState = await prisma.schoolBillingState.findUnique({
        where: { schoolId },
      })

      if (!billingState) {
        return res.status(404).json({
          message: "Billing state not found",
        })
      }

      const updated = await prisma.schoolBillingState.update({
        where: { schoolId },
        data: {
          isAutoRenew: !billingState.isAutoRenew,
          notes: !billingState.isAutoRenew
            ? "Auto-renew enabled by super admin"
            : "Auto-renew disabled by super admin",
        },
      })

      return res.json({
        message: "Auto-renew toggled successfully",
        billingState: updated,
      })
    } catch (error) {
      console.error("Toggle auto renew error:", error)
      return res.status(500).json({
        message: "Failed to toggle auto renew",
      })
    }
  }
)

router.get("/schools", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        message: "Only super admin can view billing schools",
      })
    }

    const search = String(req.query.search || "").trim()
    const status = String(req.query.status || "").trim().toUpperCase()
    const plan = String(req.query.plan || "").trim().toUpperCase()

    const where: any = {}

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          schoolCode: {
            contains: search,
            mode: "insensitive",
          },
        },
      ]
    }

    if (plan) {
      where.plan = plan
    }

    if (status) {
      where.billingState = {
        is: {
          status,
        },
      }
    }

    const schools = await prisma.school.findMany({
      where,
      include: {
        billingState: true,
        _count: {
          select: {
            students: true,
            teachers: true,
            classes: true,
            invoices: true,
            payments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json({
      message: "Billing schools fetched successfully",
      schools,
    })
  } catch (error) {
    console.error("Get billing schools error:", error)
    return res.status(500).json({
      message: "Failed to fetch billing schools",
    })
  }
})

export default router