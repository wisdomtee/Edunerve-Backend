import { Response, NextFunction } from "express"
import prisma from "../prisma"
import { AuthRequest } from "./auth"

export const checkSchoolActive = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user?.role === "SCHOOL_ADMIN") {
      const school = await prisma.school.findUnique({
        where: { id: req.user.schoolId! },
      })

      if (!school?.isActive) {
        return res.status(403).json({
          message: "School is suspended",
        })
      }
    }

    next()
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}