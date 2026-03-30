import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/:studentId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.studentId)

    if (isNaN(studentId)) {
      return res.status(400).json({ message: "Invalid student ID" })
    }

    const fees = await prisma.fee.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    })

    const formatted = fees.map((fee) => ({
      ...fee,
      totalAmount: fee.amount,
      amountPaid: 0,
      balance: fee.amount,
      status: fee.status || "UNPAID",
    }))

    return res.json(formatted)
  } catch (error) {
    console.error("GET FEES ERROR:", error)
    return res.status(500).json({ message: "Failed to fetch fees" })
  }
})

export default router