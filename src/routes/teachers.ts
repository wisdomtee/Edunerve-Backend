import { Router } from "express"
import prisma from "../prisma"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        school: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    res.json(teachers)
  } catch (error) {
    console.error("GET /teachers error:", error)
    res.status(500).json({ message: "Failed to fetch teachers" })
  }
})

router.post("/create", async (req, res) => {
  try {
    const { name, email, subject, schoolId } = req.body

    if (!name || !schoolId) {
      return res.status(400).json({ message: "Name and school are required" })
    }

    const teacher = await prisma.teacher.create({
      data: {
        name,
        email,
        subject,
        schoolId,
      },
      include: {
        school: true,
      },
    })

    res.status(201).json(teacher)
  } catch (error) {
    console.error("POST /teachers/create error:", error)
    res.status(500).json({ message: "Failed to create teacher" })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    await prisma.teacher.delete({
      where: { id },
    })

    res.json({ message: "Teacher deleted successfully" })
  } catch (error) {
    console.error("DELETE /teachers/:id error:", error)
    res.status(500).json({ message: "Failed to delete teacher" })
  }
})

export default router