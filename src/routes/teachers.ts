import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/", authMiddleware, async (_req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        school: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json(teachers)
  } catch (error) {
    console.error("GET /teachers error:", error)
    return res.status(500).json({ message: "Failed to fetch teachers" })
  }
})

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, subject, email, password, schoolId } = req.body as {
      name: string
      subject: string
      email: string
      password: string
      schoolId: string
    }

    if (!name || !subject || !email || !password || !schoolId) {
      return res.status(400).json({
        message: "name, subject, email, password and schoolId are required",
      })
    }

    const teacher = await prisma.teacher.create({
      data: {
        name,
        subject,
        email,
        password,
        schoolId,
      },
      include: {
        school: true,
      },
    })

    return res.json(teacher)
  } catch (error) {
    console.error("POST /teachers/create error:", error)
    return res.status(500).json({ message: "Failed to create teacher" })
  }
})

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string
    const { name, subject, email, password, schoolId } = req.body as {
      name: string
      subject: string
      email: string
      password: string
      schoolId: string
    }

    if (!id) {
      return res.status(400).json({ message: "Teacher id is required" })
    }

    if (!name || !subject || !email || !password || !schoolId) {
      return res.status(400).json({
        message: "name, subject, email, password and schoolId are required",
      })
    }

    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        name,
        subject,
        email,
        password,
        schoolId,
      },
      include: {
        school: true,
      },
    })

    return res.json(teacher)
  } catch (error) {
    console.error("PUT /teachers/:id error:", error)
    return res.status(500).json({ message: "Failed to update teacher" })
  }
})

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string

    if (!id) {
      return res.status(400).json({ message: "Teacher id is required" })
    }

    await prisma.teacher.delete({
      where: { id },
    })

    return res.json({ message: "Teacher deleted successfully" })
  } catch (error) {
    console.error("DELETE /teachers/:id error:", error)
    return res.status(500).json({ message: "Failed to delete teacher" })
  }
})

export default router