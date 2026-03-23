import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export type AuthRequest = Request & {
  user?: {
    id: string
    email: string
    role?: string
  }
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.get("authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized: No token provided",
      })
    }

    const token = authHeader.split(" ")[1]

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT_SECRET is missing in .env",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      id: string
      email: string
      role?: string
    }

    req.user = decoded
    return next()
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized: Invalid token",
    })
  }
}