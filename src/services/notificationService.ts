import prisma from "../prisma"
import { firebaseAdmin } from "../lib/firebase"
import { io } from "../socket"

type NotificationData = Record<string, any>

type SendNotificationInput = {
  userId: number
  title: string
  body: string
  type?: string
  data?: NotificationData
}

function normalizeDataForFirebase(data?: NotificationData) {
  if (!data) return {}

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)])
  )
}

export async function sendNotification({
  userId,
  title,
  body,
  type = "GENERAL",
  data,
}: SendNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      body,
      type,
      data,
    },
  })

  // Live socket notification
  if (io) {
    io.to(`user:${userId}`).emit("notification:new", notification)

    io.to(String(userId)).emit("notification:new", notification)

    io.to(`user:${userId}`).emit("notification:unread_count_updated", {
      userId,
    })

    io.to(String(userId)).emit("notification:unread_count_updated", {
      userId,
    })
  }

  // Push notification only if Firebase is configured
  if (firebaseAdmin) {
    try {
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      })

      const tokens = deviceTokens
        .map((item) => item.token)
        .filter((token): token is string => Boolean(token))

      if (tokens.length > 0) {
        const response = await firebaseAdmin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title,
            body,
          },
          data: {
            type,
            notificationId: String(notification.id),
            userId: String(userId),
            ...normalizeDataForFirebase(data),
          },
        })

        const invalidTokens: string[] = []

        response.responses.forEach((result, index) => {
          if (!result.success) {
            invalidTokens.push(tokens[index])
          }
        })

        if (invalidTokens.length > 0) {
          await prisma.deviceToken.deleteMany({
            where: {
              token: {
                in: invalidTokens,
              },
            },
          })
        }
      }
    } catch (error) {
      console.error("Push notification send error:", error)
    }
  }

  return notification
}

export async function sendBulkNotifications(
  userIds: number[],
  title: string,
  body: string,
  type = "GENERAL",
  data?: NotificationData
) {
  const notifications = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          title,
          body,
          type,
          data,
        },
      })
    )
  )

  if (io) {
    notifications.forEach((notification) => {
      io!.to(`user:${notification.userId}`).emit("notification:new", notification)
      io!.to(String(notification.userId)).emit("notification:new", notification)

      io!.to(`user:${notification.userId}`).emit(
        "notification:unread_count_updated",
        {
          userId: notification.userId,
        }
      )

      io!.to(String(notification.userId)).emit(
        "notification:unread_count_updated",
        {
          userId: notification.userId,
        }
      )
    })
  }

  return notifications
}