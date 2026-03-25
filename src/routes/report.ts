import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/", authMiddleware, async (_req, res) => {
  try {
    const results = await prisma.result.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        student: true,
      },
    })

    return res.status(200).json(results)
  } catch (error: any) {
    console.error("GET RESULTS ERROR:", error)

    return res.status(500).json({
      message: "Failed to fetch results",
      error: error.message,
    })
  }
})

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { subject, score, studentId } = req.body

    if (!subject || score === undefined || !studentId) {
      return res.status(400).json({
        message: "Subject, score and studentId are required",
      })
    }

    const numericScore = Number(score)

    if (Number.isNaN(numericScore)) {
      return res.status(400).json({
        message: "Score must be a valid number",
      })
    }

    if (numericScore < 0 || numericScore > 100) {
      return res.status(400).json({
        message: "Score must be between 0 and 100",
      })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
    })

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      })
    }

    const result = await prisma.result.create({
      data: {
        subject,
        score: numericScore,
        studentId,
      },
      include: {
        student: true,
      },
    })

    return res.status(201).json({
      message: "Result created successfully",
      result,
    })
  } catch (error: any) {
    console.error("CREATE RESULT ERROR:", error)

    return res.status(500).json({
      message: "Failed to create result",
      error: error.message,
    })
  }
})

export default router