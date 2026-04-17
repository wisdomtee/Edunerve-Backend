import { Request, Response, NextFunction } from "express"
import jwt, { JwtPayload } from "jsonwebtoken"

export type UserRole =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "PARENT"

export interface AuthUser {
  id: number
  role: UserRole | string
  schoolId?: number | null
  email?: string
  name?: string
}

export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: AuthUser
}

interface TokenPayload extends JwtPayload {
  id?: number | string
  role?: string
  schoolId?: number | string | null
  email?: string
  name?: string
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      res.status(401).json({
        message: "Unauthorized",
      })
      return
    }

    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        message: "Invalid authorization format",
      })
      return
    }

    const token = authHeader.split(" ")[1]?.trim()

    if (!token) {
      res.status(401).json({
        message: "Unauthorized",
      })
      return
    }

    if (!process.env.JWT_SECRET) {
      res.status(500).json({
        message: "JWT secret is not configured",
      })
      return
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as TokenPayload

    if (!decoded || typeof decoded !== "object") {
      res.status(401).json({
        message: "Invalid token payload",
      })
      return
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
      res.status(401).json({
        message: "Invalid token payload",
      })
      return
    }

    req.user = {
      id: userId,
      role: decoded.role,
      schoolId,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    }

    next()
  } catch (error) {
    console.error("AUTH ERROR:", error)

    res.status(401).json({
      message: "Invalid or expired token",
    })
  }
}

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Unauthorized",
      })
      return
    }

    if (!roles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        message: "Access denied",
      })
      return
    }

    next()
  }
}