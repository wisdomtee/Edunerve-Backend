import { Router } from "express"
import prisma from "../lib/prisma"

const router = Router()

router.get("/verify/:code", async (req, res) => {
  try {
    const { code } = req.params

    if (!code) {
      return res.status(400).json({
        message: "Verification code is required",
      })
    }

    const result = await prisma.result.findFirst({
      where: {
        OR: [
          { verificationCode: code },
          { id: Number(code) },
        ],
      },
      include: {
        student: true,
        subject: true,
        school: true,
      },
    })

    if (!result) {
      return res.status(404).json({
        message: "Result not found",
      })
    }

    return res.json({
      verified: true,
      result,
    })
  } catch (error) {
    console.error("Verification error:", error)

    return res.status(500).json({
      message: "Server error",
    })
  }
})

export default router