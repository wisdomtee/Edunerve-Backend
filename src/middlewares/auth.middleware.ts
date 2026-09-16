import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export type AuthRequest = Request & {
  user?: {
    id: number
    email?: string
    schoolId: number | null
    role: string
  }
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" })
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid token format" })
    }

    const token = authHeader.split(" ")[1]?.trim()

    if (!token) {
      return res.status(401).json({ message: "Invalid token format" })
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret is not configured" })
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    ) as {
      id?: number | string
      email?: string
      schoolId?: number | string | null
      role?: string
    }

    const userId =
      typeof decoded.id === "number"
        ? decoded.id
        : typeof decoded.id === "string" && !isNaN(Number(decoded.id))
        ? Number(decoded.id)
        : null

    const schoolId =
      typeof decoded.schoolId === "number"
        ? decoded.schoolId
        : typeof decoded.schoolId === "string" &&
          !isNaN(Number(decoded.schoolId))
        ? Number(decoded.schoolId)
        : null

    if (userId === null || typeof decoded.role !== "string") {
      return res.status(401).json({ message: "Invalid token payload" })
    }

    req.user = {
      id: userId,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      schoolId,
      role: decoded.role,
    }

    next()
  } catch (error) {
    console.error("AUTH ERROR:", error)

    return res.status(401).json({
      message: "Unauthorized / Invalid token",
    })
  }
}
