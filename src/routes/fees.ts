import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/:studentId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.studentId)

    const fees = await prisma.fee.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    })

    const formatted = fees.map((fee) => {
      const balance = fee.totalAmount - fee.amountPaid

      let status: "PAID" | "PARTIAL" | "UNPAID" = "UNPAID"

      if (fee.amountPaid === fee.totalAmount) status = "PAID"
      else if (fee.amountPaid > 0) status = "PARTIAL"

      return {
        ...fee,
        balance,
        status,
      }
    })

    res.json(formatted)
  } catch (error) {
    console.error("GET FEES ERROR:", error)
    res.status(500).json({ message: "Failed to fetch fees" })
  }
})

export default router