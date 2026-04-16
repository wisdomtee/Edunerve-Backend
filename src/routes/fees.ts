import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { requireActiveSubscription } from "../middleware/subscription"

const router = Router()

const computeStatus = (
  amount: number,
  paidAmount: number,
  dueDate?: Date | null
) => {
  const balance = Math.max(amount - paidAmount, 0)

  if (balance <= 0) return "PAID"
  if (paidAmount > 0 && balance > 0) return "PARTIAL"

  if (dueDate && new Date(dueDate) < new Date()) {
    return "OVERDUE"
  }

  return "PENDING"
}

// CREATE INVOICE
router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, amount, dueDate, studentId } = req.body

      const parsedStudentId = Number(studentId)
      const parsedAmount = Number(amount)

      if (
        !title ||
        isNaN(parsedStudentId) ||
        isNaN(parsedAmount) ||
        parsedAmount <= 0
      ) {
        return res.status(400).json({
          message: "title, amount and valid studentId are required",
        })
      }

      const student = await prisma.student.findUnique({
        where: { id: parsedStudentId },
        select: {
          id: true,
          name: true,
          schoolId: true,
        },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student not found",
        })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId || req.user.schoolId !== student.schoolId) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }
      }

      const invoice = await prisma.feeInvoice.create({
        data: {
          title: String(title).trim(),
          description: description ? String(description).trim() : null,
          amount: parsedAmount,
          paidAmount: 0,
          balance: parsedAmount,
          status: computeStatus(
            parsedAmount,
            0,
            dueDate ? new Date(dueDate) : null
          ),
          dueDate: dueDate ? new Date(dueDate) : null,
          studentId: student.id,
          schoolId: student.schoolId,
        },
      })

      return res.status(201).json({
        message: "Fee invoice created successfully",
        invoice,
      })
    } catch (error: any) {
      console.error("CREATE FEE ERROR:", error)
      return res.status(500).json({
        message: "Failed to create fee invoice",
        error: error.message,
      })
    }
  }
)

// BULK CREATE INVOICES FOR A CLASS
router.post(
  "/bulk-create",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        schoolId,
        className,
        title,
        description,
        amount,
        dueDate,
      } = req.body

      const parsedSchoolId = Number(schoolId)
      const parsedAmount = Number(amount)
      const trimmedClassName = String(className || "").trim()

      if (
        isNaN(parsedSchoolId) ||
        !trimmedClassName ||
        !title ||
        isNaN(parsedAmount) ||
        parsedAmount <= 0
      ) {
        return res.status(400).json({
          message: "schoolId, className, title and valid amount are required",
        })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId || req.user.schoolId !== parsedSchoolId) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }
      }

      const students = await prisma.student.findMany({
        where: {
          schoolId: parsedSchoolId,
          class: {
            is: {
              name: trimmedClassName,
            },
          },
        },
        select: {
          id: true,
          name: true,
          schoolId: true,
          class: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!students.length) {
        return res.status(404).json({
          message: "No students found for this class",
        })
      }

      const status = computeStatus(
        parsedAmount,
        0,
        dueDate ? new Date(dueDate) : null
      )

      const invoiceData = students.map((student) => ({
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        amount: parsedAmount,
        paidAmount: 0,
        balance: parsedAmount,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
        studentId: student.id,
        schoolId: student.schoolId,
      }))

      const result = await prisma.feeInvoice.createMany({
        data: invoiceData,
      })

      return res.status(201).json({
        message: "Bulk fee invoices created successfully",
        count: result.count,
        className: trimmedClassName,
      })
    } catch (error: any) {
      console.error("BULK CREATE FEE ERROR:", error)
      return res.status(500).json({
        message: "Failed to bulk create fee invoices",
        error: error.message,
      })
    }
  }
)

// GET PARENT FEES FOR LINKED STUDENT
router.get(
  "/parent/student/:studentId",
  authMiddleware,
  authorizeRoles("PARENT"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)

      if (isNaN(studentId)) {
        return res.status(400).json({
          message: "Invalid student id",
        })
      }

      const parent = await prisma.parent.findUnique({
        where: {
          userId: req.user?.id,
        },
        include: {
          students: {
            select: {
              id: true,
              name: true,
              class: {
                select: {
                  name: true,
                },
              },
              schoolId: true,
            },
          },
        },
      })

      if (!parent) {
        return res.status(404).json({
          message: "Parent profile not found",
        })
      }

      const linkedStudent = parent.students.find((item) => item.id === studentId)

      if (!linkedStudent) {
        return res.status(403).json({
          message: "You can only access fees for your linked child",
        })
      }

      const invoices = await prisma.feeInvoice.findMany({
        where: {
          studentId,
        },
        include: {
          payments: {
            orderBy: {
              paidAt: "desc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      const totalAmount = invoices.reduce((sum, item) => sum + item.amount, 0)
      const totalPaid = invoices.reduce((sum, item) => sum + item.paidAmount, 0)
      const totalBalance = invoices.reduce((sum, item) => sum + item.balance, 0)

      return res.status(200).json({
        student: {
          id: linkedStudent.id,
          name: linkedStudent.name,
          className: linkedStudent.class?.name || "",
        },
        summary: {
          totalAmount,
          totalPaid,
          totalBalance,
          invoiceCount: invoices.length,
        },
        invoices,
      })
    } catch (error: any) {
      console.error("GET PARENT FEES ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch fees",
        error: error.message,
      })
    }
  }
)

// RECORD PAYMENT
router.post(
  "/:invoiceId/pay",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const invoiceId = Number(req.params.invoiceId)
      const { amount, method, reference, note } = req.body

      const parsedAmount = Number(amount)

      if (isNaN(invoiceId) || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          message: "Valid invoiceId and payment amount are required",
        })
      }

      const invoice = await prisma.feeInvoice.findUnique({
        where: { id: invoiceId },
      })

      if (!invoice) {
        return res.status(404).json({
          message: "Invoice not found",
        })
      }

      if (req.user?.role !== "SUPER_ADMIN") {
        if (!req.user?.schoolId || req.user.schoolId !== invoice.schoolId) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }
      }

      const nextPaidAmount = invoice.paidAmount + parsedAmount
      const nextBalance = Math.max(invoice.amount - nextPaidAmount, 0)
      const nextStatus = computeStatus(
        invoice.amount,
        nextPaidAmount,
        invoice.dueDate
      )

      const payment = await prisma.feePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: parsedAmount,
          method: method ? String(method).trim() : null,
          reference: reference ? String(reference).trim() : null,
          note: note ? String(note).trim() : null,
        },
      })

      const updatedInvoice = await prisma.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: nextPaidAmount,
          balance: nextBalance,
          status: nextStatus,
        },
        include: {
          payments: {
            orderBy: {
              paidAt: "desc",
            },
          },
        },
      })

      return res.status(200).json({
        message: "Payment recorded successfully",
        payment,
        invoice: updatedInvoice,
      })
    } catch (error: any) {
      console.error("RECORD PAYMENT ERROR:", error)
      return res.status(500).json({
        message: "Failed to record payment",
        error: error.message,
      })
    }
  }
)

export default router