import { Router, Request, Response } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"
import { Server } from "socket.io"

type AuthRequest = Request & {
  user?: {
    id: number
    role?: string
    schoolId?: number | null
  }
}

export default function createMessageRoutes(io: Server) {
  const router = Router()

  router.use(authMiddleware)

  // GET /messages
  router.get("/", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const type = String(req.query.type || "all")

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      let where: any = {}

      if (type === "inbox") {
        where = { receiverId: userId }
      } else if (type === "sent") {
        where = { senderId: userId }
      } else {
        where = {
          OR: [{ senderId: userId }, { receiverId: userId }],
        }
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.json(messages)
    } catch (error) {
      console.error("GET /messages error:", error)
      return res.status(500).json({ message: "Failed to fetch messages" })
    }
  })

  // PUT /messages/:id/read
  router.put("/:id/read", async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user
      const id = Number(req.params.id)

      if (!user?.id) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid message id" })
      }

      const message = await prisma.message.findUnique({
        where: { id },
      })

      if (!message) {
        return res.status(404).json({ message: "Message not found" })
      }

      if (message.receiverId !== user.id) {
        return res.status(403).json({ message: "Not allowed" })
      }

      const updated = await prisma.message.update({
        where: { id },
        data: { isRead: true },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
      })

      io.to(`user_${message.senderId}`).emit("message_read", {
        messageId: updated.id,
        receiverId: updated.receiverId,
      })

      return res.json(updated)
    } catch (error) {
      console.error("PUT /messages/:id/read error:", error)
      return res.status(500).json({ message: "Failed to update message" })
    }
  })

  // PATCH /messages/:id/read
  router.patch("/:id/read", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const messageId = Number(req.params.id)

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message id" })
      }

      const existingMessage = await prisma.message.findUnique({
        where: { id: messageId },
      })

      if (!existingMessage) {
        return res.status(404).json({ message: "Message not found" })
      }

      if (existingMessage.receiverId !== userId) {
        return res.status(403).json({ message: "Not allowed" })
      }

      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: { isRead: true },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
      })

      io.to(`user_${existingMessage.senderId}`).emit("message_read", {
        messageId: updatedMessage.id,
        receiverId: updatedMessage.receiverId,
      })

      return res.json(updatedMessage)
    } catch (error) {
      console.error("PATCH /messages/:id/read error:", error)
      return res.status(500).json({ message: "Failed to mark message as read" })
    }
  })

  // GET /messages/inbox
  router.get("/inbox", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      const messages = await prisma.message.findMany({
        where: { receiverId: userId },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.json(messages)
    } catch (error) {
      console.error("GET /messages/inbox error:", error)
      return res.status(500).json({ message: "Failed to fetch inbox messages" })
    }
  })

  // GET /messages/sent
  router.get("/sent", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      const messages = await prisma.message.findMany({
        where: { senderId: userId },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.json(messages)
    } catch (error) {
      console.error("GET /messages/sent error:", error)
      return res.status(500).json({ message: "Failed to fetch sent messages" })
    }
  })

  // GET /messages/conversation/:userId
  router.get("/conversation/:userId", async (req: AuthRequest, res: Response) => {
    try {
      const currentUserId = req.user?.id
      const otherUserId = Number(req.params.userId)

      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user id" })
      }

      const messages = await prisma.message.findMany({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: currentUserId },
          ],
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      })

      return res.json(messages)
    } catch (error) {
      console.error("GET /messages/conversation/:userId error:", error)
      return res.status(500).json({ message: "Failed to fetch conversation" })
    }
  })

  // GET /messages/:id
  router.get("/:id", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const messageId = Number(req.params.id)

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message id" })
      }

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
      })

      if (!message) {
        return res.status(404).json({ message: "Message not found" })
      }

      return res.json(message)
    } catch (error) {
      console.error("GET /messages/:id error:", error)
      return res.status(500).json({ message: "Failed to fetch message" })
    }
  })

  // POST /messages/send
  router.post("/send", async (req: AuthRequest, res: Response) => {
    try {
      const senderId = req.user?.id
      const schoolId = req.user?.schoolId ?? null
      const { receiverId, subject, content } = req.body

      if (!senderId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (!receiverId || !content) {
        return res.status(400).json({
          message: "receiverId and content are required",
        })
      }

      const receiver = await prisma.user.findUnique({
        where: { id: Number(receiverId) },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          schoolId: true,
        },
      })

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" })
      }

      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          schoolId: true,
        },
      })

      const newMessage = await prisma.message.create({
        data: {
          senderId,
          receiverId: Number(receiverId),
          subject: subject || null,
          content,
          schoolId,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              schoolId: true,
            },
          },
        },
      })

      try {
        await prisma.notification.create({
          data: {
            userId: Number(receiverId),
            title: "New Message",
            message: `${sender?.name || "Someone"} sent you a message`,
          },
        })
      } catch (notificationError) {
        console.error("Notification creation error:", notificationError)
      }

      io.to(`user_${Number(receiverId)}`).emit("new_message", newMessage)

      io.to(`user_${Number(receiverId)}`).emit("notification", {
        type: "MESSAGE",
        title: "New Message",
        message: `${sender?.name || "Someone"} sent you a message`,
        href: "/dashboard/messages",
        time: "Just now",
      })

      return res.status(201).json(newMessage)
    } catch (error) {
      console.error("POST /messages/send error:", error)
      return res.status(500).json({ message: "Failed to send message" })
    }
  })

  // DELETE /messages/:id
  router.delete("/:id", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const messageId = Number(req.params.id)

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message id" })
      }

      const existingMessage = await prisma.message.findUnique({
        where: { id: messageId },
      })

      if (!existingMessage) {
        return res.status(404).json({ message: "Message not found" })
      }

      if (
        existingMessage.senderId !== userId &&
        existingMessage.receiverId !== userId
      ) {
        return res.status(403).json({ message: "Not allowed" })
      }

      await prisma.message.delete({
        where: { id: messageId },
      })

      io.to(`user_${existingMessage.senderId}`).emit("message_deleted", {
        messageId,
      })
      io.to(`user_${existingMessage.receiverId}`).emit("message_deleted", {
        messageId,
      })

      return res.json({ message: "Message deleted successfully" })
    } catch (error) {
      console.error("DELETE /messages/:id error:", error)
      return res.status(500).json({ message: "Failed to delete message" })
    }
  })

  return router
}