import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

// GET all classes
router.get("/", authMiddleware, async (_req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        school: true,
        students: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.status(200).json({ classes })
  } catch (error: any) {
    console.error("GET /classes error:", error)
    return res.status(500).json({
      message: "Failed to fetch classes",
      error: error.message,
    })
  }
})

// CREATE class
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, schoolId } = req.body

    if (!name || !schoolId) {
      return res.status(400).json({
        message: "Name and schoolId are required",
      })
    }

    const school = await prisma.school.findUnique({
      where: { id: Number(schoolId) },
    })

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    const newClass = await prisma.class.create({
      data: {
        name,
        schoolId: Number(schoolId),
      },
      include: {
        school: true,
      },
    })

    return res.status(201).json(newClass)
  } catch (error: any) {
    console.error("POST /classes/create error:", error)
    return res.status(500).json({
      message: "Failed to create class",
      error: error.message,
    })
  }
})

// UPDATE class
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, schoolId } = req.body

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class id" })
    }

    if (!name || !schoolId) {
      return res.status(400).json({
        message: "Name and schoolId are required",
      })
    }

    const existingClass = await prisma.class.findUnique({
      where: { id },
    })

    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" })
    }

    const school = await prisma.school.findUnique({
      where: { id: Number(schoolId) },
    })

    if (!school) {
      return res.status(404).json({ message: "School not found" })
    }

    const updatedClass = await prisma.class.update({
      where: { id },
      data: {
        name,
        schoolId: Number(schoolId),
      },
      include: {
        school: true,
      },
    })

    return res.status(200).json(updatedClass)
  } catch (error: any) {
    console.error("PUT /classes/:id error:", error)
    return res.status(500).json({
      message: "Failed to update class",
      error: error.message,
    })
  }
})

// DELETE class
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid class id" })
    }

    const existingClass = await prisma.class.findUnique({
      where: { id },
    })

    if (!existingClass) {
      return res.status(404).json({ message: "Class not found" })
    }

    await prisma.class.delete({
      where: { id },
    })

    return res.status(200).json({ message: "Class deleted successfully" })
  } catch (error: any) {
    console.error("DELETE /classes/:id error:", error)
    return res.status(500).json({
      message: "Failed to delete class",
      error: error.message,
    })
  }
})

export default router