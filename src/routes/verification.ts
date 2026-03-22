import express from "express"
import { PrismaClient } from "@prisma/client"

const router = express.Router()
const prisma = new PrismaClient()

router.post("/verify", async (req, res) => {
  try {

    const { studentId, verificationCode } = req.body

    const result = await prisma.result.findMany({
      where: {
        studentId: studentId,
        verificationCode: verificationCode
      },
      include: {
        student: true
      }
    })

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Result not found or invalid verification code"
      })
    }

    res.json({
      success: true,
      data: result
    })

  } catch (error) {

    console.error(error)

    res.status(500).json({
      success: false,
      message: "Server error"
    })
  }
})

export default router