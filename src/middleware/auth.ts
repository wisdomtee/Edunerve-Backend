import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export type UserRole =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "PARENT"

export interface AuthUser {
  id: number
  email: string
  role: UserRole
  schoolId?: number | null
}

export interface AuthRequest extends Request {
  user?: AuthUser
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized: No token provided",
      })
    }

    const token = authHeader.split(" ")[1]

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as AuthUser

    req.user = decoded

    next()
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized: Invalid token",
    })
  }
}