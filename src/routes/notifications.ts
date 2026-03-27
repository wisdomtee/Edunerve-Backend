import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/", authMiddleware, async (req: any, res) => {
  try {
    console.log("Notifications user:", req.user)

    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    return res.json(notifications)
  } catch (error) {
    console.error("GET /notifications error:", error)
    return res.status(500).json({ error: "Failed to fetch notifications" })
  }
})

router.patch("/read-all", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })

    return res.json({ message: "All notifications marked as read" })
  } catch (error) {
    console.error("PATCH /notifications/read-all error:", error)
    return res.status(500).json({ error: "Failed to update notifications" })
  }
})

router.patch("/:id/read", authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user?.id
    const id = Number(req.params.id)

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: user not found" })
    }

    const existingNotification = await prisma.notification.findFirst({
      where: { id, userId },
    })

    if (!existingNotification) {
      return res.status(404).json({ error: "Notification not found" })
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    return res.json(notification)
  } catch (error) {
    console.error("PATCH /notifications/:id/read error:", error)
    return res.status(500).json({ error: "Failed to update notification" })
  }
})

export default router