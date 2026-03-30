import { Router, Request, Response } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

type AuthRequest = Request & {
  user?: {
    id: number
    role?: string
    schoolId?: number | null
  }
}

router.use(authMiddleware)

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const currentUser = req.user

    if (!currentUser) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    let users

    if (currentUser.role === "SUPER_ADMIN") {
      users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          schoolId: true,
        },
        orderBy: {
          id: "asc",
        },
      })
    } else {
      users = await prisma.user.findMany({
        where: {
          schoolId: currentUser.schoolId ?? undefined,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          schoolId: true,
        },
        orderBy: {
          id: "asc",
        },
      })
    }

    return res.json(users)
  } catch (error) {
    console.error("GET /users error:", error)
    return res.status(500).json({
      message: "Failed to fetch users",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
})

export default router