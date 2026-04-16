import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export interface AuthUser {
  id: number
  role: string
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

    if (!authHeader) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid authorization format",
      })
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret is not configured",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.id !== "number" ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        message: "Invalid token payload",
      })
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      schoolId:
        typeof decoded.schoolId === "number" ? decoded.schoolId : null,
    }

    next()
  } catch (error) {
    console.error("AUTH ERROR:", error)

    return res.status(401).json({
      message: "Invalid or expired token",
    })
  }
}