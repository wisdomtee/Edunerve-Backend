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

    return res.json(classes)
  } catch (error) {
    console.error("GET /classes error:", error)
    return res.status(500).json({ message: "Failed to fetch classes" })
  }
})

// CREATE class
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, schoolId } = req.body as {
      name: string
      schoolId: string
    }

    if (!name || !schoolId) {
      return res.status(400).json({
        message: "Name and schoolId are required",
      })
    }

    const newClass = await prisma.class.create({
      data: {
        name,
        schoolId,
      },
    })

    return res.json(newClass)
  } catch (error) {
    console.error("POST /classes/create error:", error)
    return res.status(500).json({ message: "Failed to create class" })
  }
})

// UPDATE class
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string
    const { name, schoolId } = req.body as {
      name: string
      schoolId: string
    }

    if (!id) {
      return res.status(400).json({ message: "Class id is required" })
    }

    if (!name || !schoolId) {
      return res.status(400).json({
        message: "Name and schoolId are required",
      })
    }

    const updatedClass = await prisma.class.update({
      where: { id },
      data: {
        name,
        schoolId,
      },
    })

    return res.json(updatedClass)
  } catch (error) {
    console.error("PUT /classes/:id error:", error)
    return res.status(500).json({ message: "Failed to update class" })
  }
})

// DELETE class
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string

    if (!id) {
      return res.status(400).json({ message: "Class id is required" })
    }

    await prisma.class.delete({
      where: { id },
    })

    return res.json({ message: "Class deleted successfully" })
  } catch (error) {
    console.error("DELETE /classes/:id error:", error)
    return res.status(500).json({ message: "Failed to delete class" })
  }
})

export default router