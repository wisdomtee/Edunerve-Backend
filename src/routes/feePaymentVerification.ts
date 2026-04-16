import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

type AuthRequest = {
  user?: {
    id: number
    role: string
    schoolId?: number | null
  }
}

function extractInvoiceId(reference: string, metadata?: any) {
  if (metadata && typeof metadata === "object" && metadata.invoiceId) {
    const parsed = Number(metadata.invoiceId)
    if (!isNaN(parsed)) return parsed
  }

  const match = reference.match(/^EDUNERVE_(\d+)_/)
  if (!match) return null

  const parsed = Number(match[1])
  return isNaN(parsed) ? null : parsed
}

router.get("/fees/verify/:reference", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user
    const reference = String(req.params.reference || "").trim()

    if (!reference) {
      return res.status(400).json({
        message: "Payment reference is required",
      })
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        message: "PAYSTACK_SECRET_KEY is not configured",
      })
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    )

    const paystackData = await paystackResponse.json()

    if (!paystackResponse.ok || !paystackData?.status) {
      return res.status(400).json({
        message: paystackData?.message || "Failed to verify payment with Paystack",
      })
    }

    const transaction = paystackData.data

    if (!transaction || transaction.status !== "success") {
      return res.status(400).json({
        message: "Payment has not been completed successfully",
        paystackStatus: transaction?.status || null,
      })
    }

    const invoiceId = extractInvoiceId(reference, transaction.metadata)

    if (!invoiceId) {
      return res.status(400).json({
        message: "Could not determine invoice from payment reference",
      })
    }

    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentId: true,
            schoolId: true,
          },
        },
      },
    })

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (
      currentUser?.role !== "SUPER_ADMIN" &&
      currentUser?.schoolId &&
      invoice.schoolId !== currentUser.schoolId
    ) {
      return res.status(403).json({
        message: "You are not allowed to verify this invoice",
      })
    }

    const existingPayment = await prisma.feePayment.findFirst({
      where: { reference },
      select: {
        id: true,
        amount: true,
        reference: true,
        paidAt: true,
      },
    })

    if (existingPayment) {
      const refreshedInvoice = await prisma.feeInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          payments: {
            select: {
              id: true,
              amount: true,
              method: true,
              reference: true,
              note: true,
              paidAt: true,
              createdAt: true,
            },
            orderBy: { paidAt: "desc" },
          },
        },
      })

      return res.json({
        message: "Payment already verified",
        alreadyProcessed: true,
        payment: existingPayment,
        invoice: refreshedInvoice,
      })
    }

    const amountPaid = Number(transaction.amount || 0) / 100

    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({
        message: "Verified payment amount is invalid",
      })
    }

    const currentPaidAmount = Number(invoice.paidAmount || 0)
    const currentBalance = Number(invoice.balance || 0)
    const invoiceAmount = Number(invoice.amount || 0)

    const newPaidAmount = currentPaidAmount + amountPaid
    const newBalance = Math.max(currentBalance - amountPaid, 0)

    let newStatus = "PENDING"
    if (newBalance <= 0) {
      newStatus = "PAID"
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: amountPaid,
          method: "paystack",
          reference,
          note: `Verified via Paystack. Gateway status: ${transaction.status}`,
          paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
        },
      })

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          balance: newBalance,
          status: newStatus,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentId: true,
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              method: true,
              reference: true,
              note: true,
              paidAt: true,
              createdAt: true,
            },
            orderBy: { paidAt: "desc" },
          },
        },
      })

      return { payment, invoice: updatedInvoice }
    })

    return res.json({
      message:
        newBalance <= 0
          ? "Payment verified and invoice marked as PAID"
          : "Payment verified and invoice updated",
      alreadyProcessed: false,
      paystack: {
        reference: transaction.reference,
        status: transaction.status,
        amount: amountPaid,
        currency: transaction.currency,
      },
      payment: result.payment,
      invoice: result.invoice,
      summary: {
        invoiceAmount,
        previousPaidAmount: currentPaidAmount,
        newPaidAmount,
        previousBalance: currentBalance,
        newBalance,
      },
    })
  } catch (error) {
    console.error("VERIFY FEE PAYMENT ERROR:", error)
    return res.status(500).json({
      message: "Failed to verify and record payment",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export default router