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

function normalizeStatus(status?: string) {
  const allowed = ["PENDING", "PAID", "OVERDUE", "CANCELLED"]
  const value = (status || "PENDING").toUpperCase()
  return allowed.includes(value) ? value : "PENDING"
}

function canManageInvoices(role?: string) {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN"
}

const feePaymentSafeSelect = {
  id: true,
  amount: true,
  method: true,
  reference: true,
  note: true,
  paidAt: true,
  createdAt: true,
} as const

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user

    if (!canManageInvoices(currentUser?.role)) {
      return res.status(403).json({
        message: "You are not allowed to create invoices",
      })
    }

    const {
      title,
      description,
      amount,
      dueDate,
      studentId,
      studentIds,
      schoolId: bodySchoolId,
      status,
    } = req.body

    if (!title || typeof title !== "string") {
      return res.status(400).json({
        message: "Title is required",
      })
    }

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return res.status(400).json({
        message: "A valid amount is required",
      })
    }

    const finalAmount = Number(amount)

    if (finalAmount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than 0",
      })
    }

    const resolvedSchoolId =
      currentUser?.role === "SUPER_ADMIN"
        ? Number(bodySchoolId)
        : Number(currentUser?.schoolId)

    if (!resolvedSchoolId || isNaN(resolvedSchoolId)) {
      return res.status(400).json({
        message: "Valid schoolId is required",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: resolvedSchoolId },
      select: { id: true, name: true },
    })

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    const finalStatus = normalizeStatus(status)

    if (studentId) {
      const numericStudentId = Number(studentId)

      const student = await prisma.student.findFirst({
        where: {
          id: numericStudentId,
          schoolId: resolvedSchoolId,
        },
        select: {
          id: true,
          name: true,
          studentId: true,
          schoolId: true,
        },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student not found in this school",
        })
      }

      const createdInvoice = await prisma.feeInvoice.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          amount: finalAmount,
          paidAmount: 0,
          balance: finalAmount,
          status: finalStatus,
          dueDate: dueDate ? new Date(dueDate) : null,
          studentId: numericStudentId,
          schoolId: resolvedSchoolId,
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              studentId: true,
            },
          },
        },
      })

      return res.status(201).json({
        message: "Invoice created successfully",
        invoice: createdInvoice,
      })
    }

    if (Array.isArray(studentIds) && studentIds.length > 0) {
      const cleanStudentIds = [
        ...new Set(studentIds.map((id) => Number(id)).filter(Boolean)),
      ]

      const students = await prisma.student.findMany({
        where: {
          id: { in: cleanStudentIds },
          schoolId: resolvedSchoolId,
        },
        select: {
          id: true,
          name: true,
          studentId: true,
        },
      })

      if (!students.length) {
        return res.status(404).json({
          message: "No valid students found for this school",
        })
      }

      const createdInvoices = await prisma.$transaction(
        students.map((student) =>
          prisma.feeInvoice.create({
            data: {
              title: title.trim(),
              description: description?.trim() || null,
              amount: finalAmount,
              paidAmount: 0,
              balance: finalAmount,
              status: finalStatus,
              dueDate: dueDate ? new Date(dueDate) : null,
              studentId: student.id,
              schoolId: resolvedSchoolId,
            },
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  studentId: true,
                },
              },
            },
          })
        )
      )

      return res.status(201).json({
        message: `Invoices created successfully for ${createdInvoices.length} student(s)`,
        count: createdInvoices.length,
        invoices: createdInvoices,
      })
    }

    return res.status(400).json({
      message: "Provide either studentId or studentIds",
    })
  } catch (error) {
    console.error("CREATE FEE INVOICE ERROR:", error)
    return res.status(500).json({
      message: "Failed to create invoice",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

/**
 * LIST ALL INVOICES FOR CURRENT SCHOOL
 * SUPER_ADMIN can pass ?schoolId=1
 * SCHOOL_ADMIN uses their own schoolId automatically
 * Optional filters:
 * ?status=PAID
 * ?search=elena
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user

    if (!canManageInvoices(currentUser?.role)) {
      return res.status(403).json({
        message: "You are not allowed to view invoices",
      })
    }

    const querySchoolId = req.query.schoolId
      ? Number(req.query.schoolId)
      : undefined

    const resolvedSchoolId =
      currentUser?.role === "SUPER_ADMIN"
        ? querySchoolId
        : Number(currentUser?.schoolId)

    if (!resolvedSchoolId || isNaN(resolvedSchoolId)) {
      return res.status(400).json({
        message: "Valid schoolId is required",
      })
    }

    const search = String(req.query.search || "").trim()
    const status = String(req.query.status || "").trim().toUpperCase()

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        schoolId: resolvedSchoolId,
        ...(status && status !== "ALL" ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { student: { name: { contains: search, mode: "insensitive" } } },
                { student: { studentId: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentId: true,
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        payments: {
          select: feePaymentSafeSelect,
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const summary = invoices.reduce(
      (acc, invoice) => {
        acc.totalInvoices += 1
        acc.totalAmount += Number(invoice.amount || 0)
        acc.totalPaid += Number(invoice.paidAmount || 0)
        acc.totalBalance += Number(invoice.balance || 0)

        if (invoice.status === "PAID") acc.paidCount += 1
        else if (invoice.status === "OVERDUE") acc.overdueCount += 1
        else acc.pendingCount += 1

        return acc
      },
      {
        totalInvoices: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
      }
    )

    return res.json({
      summary,
      invoices,
    })
  } catch (error) {
    console.error("LIST FEE INVOICES ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch invoices",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

router.get("/student/:studentId", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user
    const studentId = Number(req.params.studentId)

    if (!studentId || isNaN(studentId)) {
      return res.status(400).json({
        message: "Valid studentId is required",
      })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        school: true,
      },
    })

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      })
    }

    if (
      currentUser?.role !== "SUPER_ADMIN" &&
      currentUser?.schoolId &&
      student.schoolId !== currentUser.schoolId
    ) {
      return res.status(403).json({
        message: "You are not allowed to access this student's invoices",
      })
    }

    const invoices = await prisma.feeInvoice.findMany({
      where: { studentId },
      include: {
        payments: {
          select: feePaymentSafeSelect,
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const summary = invoices.reduce(
      (acc, invoice) => {
        acc.totalAmount += Number(invoice.amount || 0)
        acc.totalPaid += Number(invoice.paidAmount || 0)
        acc.totalBalance += Number(invoice.balance || 0)
        return acc
      },
      {
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
      }
    )

    return res.json({
      student: {
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        className: student.class?.name || null,
        schoolId: student.schoolId,
      },
      summary,
      invoices,
    })
  } catch (error) {
    console.error("GET STUDENT INVOICES ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch student invoices",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user
    const invoiceId = Number(req.params.id)

    if (!invoiceId || isNaN(invoiceId)) {
      return res.status(400).json({
        message: "Valid invoice id is required",
      })
    }

    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: true,
        school: true,
        payments: {
          select: feePaymentSafeSelect,
          orderBy: { paidAt: "desc" },
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
        message: "You are not allowed to access this invoice",
      })
    }

    return res.json(invoice)
  } catch (error) {
    console.error("GET ONE INVOICE ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch invoice",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user

    if (!canManageInvoices(currentUser?.role)) {
      return res.status(403).json({
        message: "You are not allowed to update invoices",
      })
    }

    const invoiceId = Number(req.params.id)

    if (!invoiceId || isNaN(invoiceId)) {
      return res.status(400).json({
        message: "Valid invoice id is required",
      })
    }

    const existingInvoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
    })

    if (!existingInvoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (
      currentUser?.role !== "SUPER_ADMIN" &&
      currentUser?.schoolId !== existingInvoice.schoolId
    ) {
      return res.status(403).json({
        message: "You are not allowed to update this invoice",
      })
    }

    const {
      title,
      description,
      amount,
      paidAmount,
      balance,
      dueDate,
      status,
    } = req.body

    const updatedInvoice = await prisma.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(description !== undefined
          ? {
              description: description ? String(description).trim() : null,
            }
          : {}),
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
        ...(paidAmount !== undefined ? { paidAmount: Number(paidAmount) } : {}),
        ...(balance !== undefined ? { balance: Number(balance) } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(status !== undefined ? { status: normalizeStatus(status) } : {}),
      },
      include: {
        student: true,
        payments: {
          select: feePaymentSafeSelect,
          orderBy: { paidAt: "desc" },
        },
      },
    })

    return res.json({
      message: "Invoice updated successfully",
      invoice: updatedInvoice,
    })
  } catch (error) {
    console.error("UPDATE INVOICE ERROR:", error)
    return res.status(500).json({
      message: "Failed to update invoice",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const authReq = req as typeof req & AuthRequest
    const currentUser = authReq.user

    if (!canManageInvoices(currentUser?.role)) {
      return res.status(403).json({
        message: "You are not allowed to delete invoices",
      })
    }

    const invoiceId = Number(req.params.id)

    if (!invoiceId || isNaN(invoiceId)) {
      return res.status(400).json({
        message: "Valid invoice id is required",
      })
    }

    const existingInvoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!existingInvoice) {
      return res.status(404).json({
        message: "Invoice not found",
      })
    }

    if (
      currentUser?.role !== "SUPER_ADMIN" &&
      currentUser?.schoolId !== existingInvoice.schoolId
    ) {
      return res.status(403).json({
        message: "You are not allowed to delete this invoice",
      })
    }

    if (existingInvoice.payments.length > 0) {
      return res.status(400).json({
        message: "Cannot delete invoice with existing payments",
      })
    }

    await prisma.feeInvoice.delete({
      where: { id: invoiceId },
    })

    return res.json({
      message: "Invoice deleted successfully",
    })
  } catch (error) {
    console.error("DELETE INVOICE ERROR:", error)
    return res.status(500).json({
      message: "Failed to delete invoice",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export default router