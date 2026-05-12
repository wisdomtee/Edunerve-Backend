import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";

/**
 * Revenue Protection Middleware
 * Ensures school subscription is active
 */
export const subscriptionGuard = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const schoolId = req.user?.schoolId;

    if (!schoolId) {
      return res.status(403).json({
        message: "Tenant context missing",
      });
    }

    const subscription = await prisma.schoolSubscription.findFirst({
      where: {
        schoolId,
        status: "ACTIVE",
        endDate: {
          gte: new Date(),
        },
      },
    });

    if (!subscription) {
      return res.status(403).json({
        message: "Subscription inactive",
      });
    }

    req.subscription = subscription;

    next();
  } catch {
    res.status(500).json({
      message: "Subscription validation failed",
    });
  }
};