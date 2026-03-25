import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

// GET all schools
router.get("/", authMiddleware, async (_req, res) => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        students: true,
        teachers: true,
        classes: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.status(200).json({ schools })
  } catch (error: any) {
    console.error("GET /schools error:", error)
    return res.status(500).json({
      message: "Failed to fetch schools",
      error: error.message,
    })
  }
})

// CREATE school
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, address } = req.body

    if (!name || !address) {
      return res.status(400).json({
        message: "Name and address are required",
      })
    }

    const school = await prisma.school.create({
      data: {
        name,
        address,
      },
    })

    return res.status(201).json(school)
  } catch (error: any) {
    console.error("POST /schools/create error:", error)
    return res.status(500).json({
      message: "Failed to create school",
      error: error.message,
    })
  }
})

// UPDATE school
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, address } = req.body

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid school id" })
    }

    if (!name || !address) {
      return res.status(400).json({
        message: "Name and address are required",
      })
    }

    const existingSchool = await prisma.school.findUnique({
      where: { id },
    })

    if (!existingSchool) {
      return res.status(404).json({ message: "School not found" })
    }

    const school = await prisma.school.update({
      where: { id },
      data: {
        name,
        address,
      },
    })

    return res.status(200).json(school)
  } catch (error: any) {
    console.error("PUT /schools/:id error:", error)
    return res.status(500).json({
      message: "Failed to update school",
      error: error.message,
    })
  }
})

// DELETE school
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid school id" })
    }

    const existingSchool = await prisma.school.findUnique({
      where: { id },
    })

    if (!existingSchool) {
      return res.status(404).json({ message: "School not found" })
    }

    await prisma.school.delete({
      where: { id },
    })

    return res.status(200).json({ message: "School deleted successfully" })
  } catch (error: any) {
    console.error("DELETE /schools/:id error:", error)
    return res.status(500).json({
      message: "Failed to delete school",
      error: error.message,
    })
  }
})

export default router