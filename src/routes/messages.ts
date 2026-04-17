import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { Server } from "socket.io"

export default function createMessageRoutes(io: Server) {
  const router = Router()

  router.use(authMiddleware)

  const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    schoolId: true,
  }

  // GET /messages
  // ?type=all | inbox | sent
  router.get("/", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role
      const schoolId = req.user?.schoolId ?? null
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

      if (userRole !== "SUPER_ADMIN" && schoolId) {
        where = {
          AND: [
            where,
            {
              OR: [{ schoolId }, { schoolId: null }],
            },
          ],
        }
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(messages)
    } catch (error) {
      console.error("GET /messages error:", error)
      return res.status(500).json({ message: "Failed to fetch messages" })
    }
  })

  router.get("/inbox", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role
      const schoolId = req.user?.schoolId ?? null

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      const where: any = { receiverId: userId }

      if (userRole !== "SUPER_ADMIN" && schoolId) {
        where.OR = [{ schoolId }, { schoolId: null }]
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(messages)
    } catch (error) {
      console.error("GET /messages/inbox error:", error)
      return res.status(500).json({ message: "Failed to fetch inbox messages" })
    }
  })

  router.get("/sent", async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id
      const userRole = req.user?.role
      const schoolId = req.user?.schoolId ?? null

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      const where: any = { senderId: userId }

      if (userRole !== "SUPER_ADMIN" && schoolId) {
        where.OR = [{ schoolId }, { schoolId: null }]
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: {
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return res.status(200).json(messages)
    } catch (error) {
      console.error("GET /messages/sent error:", error)
      return res.status(500).json({ message: "Failed to fetch sent messages" })
    }
  })

  router.get("/conversation/:userId", async (req: AuthRequest, res: Response) => {
    try {
      const currentUserId = req.user?.id
      const currentUserRole = req.user?.role
      const currentSchoolId = req.user?.schoolId ?? null
      const otherUserId = Number(req.params.userId)

      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user id" })
      }

      const otherUser = await prisma.user.findUnique({
        where: { id: otherUserId },
        select: userSelect,
      })

      if (!otherUser) {
        return res.status(404).json({ message: "User not found" })
      }

      if (
        currentUserRole !== "SUPER_ADMIN" &&
        currentSchoolId &&
        otherUser.schoolId &&
        otherUser.schoolId !== currentSchoolId
      ) {
        return res.status(403).json({
          message: "You cannot view conversation across different schools",
        })
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
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
        orderBy: { createdAt: "asc" },
      })

      return res.status(200).json(messages)
    } catch (error) {
      console.error("GET /messages/conversation/:userId error:", error)
      return res.status(500).json({ message: "Failed to fetch conversation" })
    }
  })

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
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
      })

      if (!message) {
        return res.status(404).json({ message: "Message not found" })
      }

      return res.status(200).json(message)
    } catch (error) {
      console.error("GET /messages/:id error:", error)
      return res.status(500).json({ message: "Failed to fetch message" })
    }
  })

  router.post("/send", async (req: AuthRequest, res: Response) => {
    try {
      const senderId = req.user?.id
      const senderRole = req.user?.role
      const schoolId = req.user?.schoolId ?? null
      const { receiverId, subject, content } = req.body

      if (!senderId) {
        return res.status(401).json({ message: "Unauthorized" })
      }

      if (!receiverId || !content || !String(content).trim()) {
        return res.status(400).json({
          message: "receiverId and content are required",
        })
      }

      const numericReceiverId = Number(receiverId)

      if (isNaN(numericReceiverId)) {
        return res.status(400).json({
          message: "Invalid receiver id",
        })
      }

      if (numericReceiverId === senderId) {
        return res.status(400).json({
          message: "You cannot send a message to yourself",
        })
      }

      const receiver = await prisma.user.findUnique({
        where: { id: numericReceiverId },
        select: userSelect,
      })

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" })
      }

      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: userSelect,
      })

      if (!sender) {
        return res.status(404).json({ message: "Sender not found" })
      }

      if (
        senderRole !== "SUPER_ADMIN" &&
        schoolId &&
        receiver.schoolId &&
        receiver.schoolId !== schoolId
      ) {
        return res.status(403).json({
          message: "You cannot message a user from another school",
        })
      }

      const newMessage = await prisma.message.create({
        data: {
          senderId,
          receiverId: numericReceiverId,
          subject: subject ? String(subject).trim() : null,
          content: String(content).trim(),
          schoolId,
        },
        include: {
          sender: {
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
      })

      try {
        await prisma.notification.create({
          data: {
            userId: numericReceiverId,
            title: "New Message",
          },
        })
      } catch (notificationError) {
        console.error("Notification creation error:", notificationError)
      }

      io.to(`user_${numericReceiverId}`).emit("new_message", newMessage)

      io.to(`user_${numericReceiverId}`).emit("notification", {
        type: "MESSAGE",
        title: "New Message",
        message: `${sender.name || "Someone"} sent you a message`,
        href: "/dashboard/messages",
        time: "Just now",
      })

      io.to(`user_${senderId}`).emit("message_sent", newMessage)

      return res.status(201).json(newMessage)
    } catch (error) {
      console.error("POST /messages/send error:", error)
      return res.status(500).json({ message: "Failed to send message" })
    }
  })

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
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
      })

      io.to(`user_${existingMessage.senderId}`).emit("message_read", {
        messageId: updatedMessage.id,
        receiverId: updatedMessage.receiverId,
      })

      io.to(`user_${userId}`).emit("message_updated", updatedMessage)

      return res.status(200).json(updatedMessage)
    } catch (error) {
      console.error("PATCH /messages/:id/read error:", error)
      return res.status(500).json({ message: "Failed to mark message as read" })
    }
  })

  router.put("/:id/read", async (req: AuthRequest, res: Response) => {
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
            select: userSelect,
          },
          receiver: {
            select: userSelect,
          },
        },
      })

      io.to(`user_${existingMessage.senderId}`).emit("message_read", {
        messageId: updatedMessage.id,
        receiverId: updatedMessage.receiverId,
      })

      io.to(`user_${userId}`).emit("message_updated", updatedMessage)

      return res.status(200).json(updatedMessage)
    } catch (error) {
      console.error("PUT /messages/:id/read error:", error)
      return res.status(500).json({ message: "Failed to update message" })
    }
  })

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

      return res.status(200).json({
        message: "Message deleted successfully",
      })
    } catch (error) {
      console.error("DELETE /messages/:id error:", error)
      return res.status(500).json({ message: "Failed to delete message" })
    }
  })

  return router
}