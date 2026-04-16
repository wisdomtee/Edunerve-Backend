import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.use(authMiddleware)

// get current user's notifications
router.get("/", async (req: any, res) => {
  try {
    const userId = Number(req.user.id)

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    res.status(200).json(notifications)
  } catch (error) {
    console.error("Get notifications error:", error)
    res.status(500).json({ message: "Failed to fetch notifications" })
  }
})

// unread count
router.get("/unread-count", async (req: any, res) => {
  try {
    const userId = Number(req.user.id)

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    })

    res.status(200).json({ count })
  } catch (error) {
    console.error("Unread count error:", error)
    res.status(500).json({ message: "Failed to fetch unread count" })
  }
})

// mark one as read
router.patch("/:id/read", async (req: any, res) => {
  try {
    const userId = Number(req.user.id)
    const id = Number(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid notification id" })
    }

    const existing = await prisma.notification.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!existing) {
      return res.status(404).json({ message: "Notification not found" })
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    })

    return res.status(200).json(notification)
  } catch (error) {
    console.error("Mark read error:", error)
    return res.status(500).json({ message: "Failed to mark notification as read" })
  }
})

// mark all as read
router.patch("/read-all", async (req: any, res) => {
  try {
    const userId = Number(req.user.id)

    const updated = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    })

    res.status(200).json({
      message: "All notifications marked as read",
      updatedCount: updated.count,
    })
  } catch (error) {
    console.error("Read all error:", error)
    res.status(500).json({ message: "Failed to mark all as read" })
  }
})

// register device token
router.post("/register-token", async (req: any, res) => {
  try {
    const userId = Number(req.user.id)
    const { token, platform } = req.body

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token is required" })
    }

    const saved = await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
      },
      create: {
        userId,
        token,
        platform,
      },
    })

    return res.status(200).json({
      message: "Device token registered successfully",
      deviceToken: saved,
    })
  } catch (error) {
    console.error("Register token error:", error)
    return res.status(500).json({ message: "Failed to register token" })
  }
})

export default router