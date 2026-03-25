import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: "asc" },
    })

    res.json(subjects)
  } catch (error) {
    console.error("GET /subjects error:", error)
    res.status(500).json({ message: "Failed to fetch subjects" })
  }
})

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, schoolId } = req.body

    if (!name || !schoolId) {
      return res.status(400).json({
        message: "Subject name and schoolId are required",
      })
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        school: {
          connect: { id: Number(schoolId) },
        },
      },
    })

    return res.status(201).json(subject)
  } catch (error: any) {
    console.error("POST /subjects/create error:", error)

    return res.status(500).json({
      message: "Failed to create subject",
      error: error.message,
    })
  }
})

export default router