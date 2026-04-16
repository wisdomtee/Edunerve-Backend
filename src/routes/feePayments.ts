import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

type AuthUser = {
  id?: number
  role?: string
  schoolId?: number | null
}

function getUser(req: any): AuthUser | null {
  return (req.user as AuthUser) || null
}

function canManageFeePayments(role?: string) {
  return (
    role === "SUPER_ADMIN" ||
    role === "SCHOOL_ADMIN" ||
    role === "PARENT"
  )
}

router.post("/pay", authMiddleware, async (req, res) => {
  try {
    const user = getUser(req)
    const { invoiceId, amount, reference, method, note } = req.body

    if (!canManageFeePayments(user?.role)) {
      return res.status(403).json({
        message: "You are not allowed to make this payment",
      })
    }

    if (!invoiceId || amount === undefined || amount === null) {
      return res.status(400).json({
        message: "invoiceId and amount are required",
      })
    }

    const numericInvoiceId = Number(invoiceId)
    const paymentAmount = Number(amount)

    if (!numericInvoiceId || Number.isNaN(numericInvoiceId)) {
      return res.status(400).json({
        message: "A valid invoiceId is required",
      })
    }

    if (!paymentAmount || Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than 0",
      })
    }

    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: numericInvoiceId },
      include: {
        student: {
          include: {
            parent: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
        payments: {
          orderBy: {
            paidAt: "desc",
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
      user?.role === "SCHOOL_ADMIN" &&
      Number(user.schoolId) !== invoice.schoolId
    ) {
      return res.status(403).json({
        message: "You are not allowed to pay this invoice",
      })
    }

    if (user?.role === "PARENT") {
      const parentUserId = invoice.student?.parent?.userId
      if (!parentUserId || parentUserId !== user.id) {
        return res.status(403).json({
          message: "You are not allowed to pay this invoice",
        })
      }
    }

    if (invoice.balance <= 0 || invoice.status === "PAID") {
      return res.status(400).json({
        message: "Invoice already paid",
      })
    }

    if (paymentAmount > invoice.balance) {
      return res.status(400).json({
        message: "Payment amount cannot be greater than invoice balance",
      })
    }

    const cleanReference =
      String(reference || "").trim() || `PAY-${Date.now()}`

    const existingReference = await prisma.feePayment.findFirst({
      where: {
        OR: [
          { reference: cleanReference },
          { providerReference: cleanReference },
        ],
      },
    })

    if (existingReference) {
      return res.status(400).json({
        message: "This payment reference has already been used",
      })
    }

    const newPaidAmount = Number(invoice.paidAmount) + paymentAmount
    const newBalance = Math.max(Number(invoice.amount) - newPaidAmount, 0)

    const status =
      newBalance <= 0
        ? "PAID"
        : newPaidAmount > 0
        ? "PARTIAL"
        : "PENDING"

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.feePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: paymentAmount,
          reference: cleanReference,
          method: String(method || "PAYSTACK").trim().toUpperCase(),
          note: note ? String(note).trim() : null,
          status: "SUCCESS",
          provider: "PAYSTACK",
          providerReference: cleanReference,
          currency: "NGN",
        },
      })

      const updatedInvoice = await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          balance: newBalance,
          status,
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
            orderBy: {
              paidAt: "desc",
            },
          },
        },
      })

      return {
        payment,
        invoice: updatedInvoice,
      }
    })

    return res.json({
      message: "Payment successful",
      payment: result.payment,
      invoice: result.invoice,
    })
  } catch (error) {
    console.error("FEE PAYMENT ERROR:", error)
    return res.status(500).json({
      message: "Payment failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export default router