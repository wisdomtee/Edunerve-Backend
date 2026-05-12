import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const quotaGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const prisma = (await import("../prisma")).default;

    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: {
        school: true,
      },
    });

    if (!user?.school) {
      return res.status(403).json({
        message: "School not found",
      });
    }

    if (
      user.school.studentQuota !== null &&
      user.school.studentCount >= user.school.studentQuota
    ) {
      return res.status(403).json({
        message: "Student quota exceeded",
      });
    }

    next();
  } catch {
    return res.status(500).json({
      message: "Server error",
    });
  }
};