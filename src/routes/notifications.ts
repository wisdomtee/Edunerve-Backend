import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    return res.json(
      notifications.map((notification) => ({
        ...notification,
        read: false,
      }))
    )
  } catch (error) {
    console.error("GET /notifications error:", error)
    return res.status(500).json({ error: "Failed to fetch notifications" })
  }
})

router.patch("/read-all", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      select: { id: true },
    })

    return res.json({
      message: "Read status is not stored in the current Notification model",
      updatedCount: notifications.length,
    })
  } catch (error) {
    console.error("PATCH /notifications/read-all error:", error)
    return res.status(500).json({ error: "Failed to update notifications" })
  }
})

router.patch("/:id/read", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id
    const id = Number(req.params.id)

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid notification ID" })
    }

    const existingNotification = await prisma.notification.findFirst({
      where: { id, userId },
    })

    if (!existingNotification) {
      return res.status(404).json({ error: "Notification not found" })
    }

    return res.json({
      ...existingNotification,
      read: true,
      message: "Read status is not stored in the current Notification model",
    })
  } catch (error) {
    console.error("PATCH /notifications/:id/read error:", error)
    return res.status(500).json({ error: "Failed to update notification" })
  }
})

export default router