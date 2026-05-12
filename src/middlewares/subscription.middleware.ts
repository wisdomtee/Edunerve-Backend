import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const subscriptionGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const prisma = (await import("../prisma")).default;

    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
    });

    if (!user?.subscriptionActive) {
      return res.status(403).json({
        message: "Subscription inactive",
      });
    }

    if (
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) < new Date()
    ) {
      return res.status(403).json({
        message: "Subscription expired",
      });
    }

    next();
  } catch {
    return res.status(500).json({
      message: "Server error",
    });
  }
};