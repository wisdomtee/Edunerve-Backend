import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

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

    return res.json(schools)
  } catch (error) {
    console.error("GET /schools error:", error)
    return res.status(500).json({ message: "Failed to fetch schools" })
  }
})

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, address } = req.body as {
      name: string
      address: string
    }

    if (!name || !address) {
      return res.status(400).json({ message: "Name and address are required" })
    }

    const school = await prisma.school.create({
      data: {
        name,
        address,
      },
    })

    return res.json(school)
  } catch (error) {
    console.error("POST /schools/create error:", error)
    return res.status(500).json({ message: "Failed to create school" })
  }
})

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string
    const { name, address } = req.body as {
      name: string
      address: string
    }

    if (!id) {
      return res.status(400).json({ message: "School id is required" })
    }

    if (!name || !address) {
      return res.status(400).json({ message: "Name and address are required" })
    }

    const school = await prisma.school.update({
      where: { id },
      data: {
        name,
        address,
      },
    })

    return res.json(school)
  } catch (error) {
    console.error("PUT /schools/:id error:", error)
    return res.status(500).json({ message: "Failed to update school" })
  }
})

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string

    if (!id) {
      return res.status(400).json({ message: "School id is required" })
    }

    await prisma.school.delete({
      where: { id },
    })

    return res.json({ message: "School deleted successfully" })
  } catch (error) {
    console.error("DELETE /schools/:id error:", error)
    return res.status(500).json({ message: "Failed to delete school" })
  }
})

export default router