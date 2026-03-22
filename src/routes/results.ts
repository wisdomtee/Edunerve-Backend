import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/:studentId", authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.studentId as string

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" })
    }

    const results = await prisma.result.findMany({
      where: { studentId },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json(results)
  } catch (error) {
    console.error("GET /results/:studentId error:", error)
    return res.status(500).json({ message: "Failed to fetch results" })
  }
})

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { studentId, subject, score } = req.body as {
      studentId: string
      subject: string
      score: number | string
    }

    if (!studentId || !subject || score === undefined || score === null) {
      return res.status(400).json({
        message: "studentId, subject and score are required",
      })
    }

    const result = await prisma.result.create({
      data: {
        studentId,
        subject,
        score: Number(score),
      },
    })

    return res.json(result)
  } catch (error) {
    console.error("POST /results error:", error)
    return res.status(500).json({ message: "Failed to create result" })
  }
})

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string

    if (!id) {
      return res.status(400).json({ message: "Result id is required" })
    }

    await prisma.result.delete({
      where: { id },
    })

    return res.json({ message: "Result deleted" })
  } catch (error) {
    console.error("DELETE /results/:id error:", error)
    return res.status(500).json({ message: "Failed to delete result" })
  }
})

export default router