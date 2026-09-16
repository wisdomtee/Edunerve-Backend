import { Response, NextFunction } from "express"
import { AuthRequest } from "./auth.middleware"
import prisma from "../lib/prisma"

export const subscriptionGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionActive: true,
        subscriptionExpiresAt: true,
      },
    })

    if (!user?.subscriptionActive) {
      return res.status(403).json({
        message: "Subscription inactive",
      })
    }

    if (
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) < new Date()
    ) {
      return res.status(403).json({
        message: "Subscription expired",
      })
    }

    next()
  } catch (error) {
    console.error("Subscription guard error:", error)
    return res.status(500).json({
      message: "Server error",
    })
  }
}