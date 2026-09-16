import { Response, NextFunction } from "express"
import { AuthRequest } from "./auth.middleware"
import prisma from "../lib/prisma"

export const subscriptionGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user

    if (!user || !user.id) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        subscriptionActive: true,
        subscriptionExpiresAt: true,
      }
    })

    if (!dbUser) {
      return res.status(404).json({ message: "User not found" })
    }

    if (!dbUser.subscriptionActive) {
      return res.status(403).json({
        message: "Subscription inactive. Please renew your subscription."
      })
    }

    if (
      dbUser.subscriptionExpiresAt &&
      new Date(dbUser.subscriptionExpiresAt) < new Date()
    ) {
      return res.status(403).json({
        message: "Subscription expired. Please renew your subscription."
      })
    }

    next()
  } catch (error) {
    console.error("Subscription guard error:", error)
    return res.status(500).json({ message: "Internal server error" })
  }
}