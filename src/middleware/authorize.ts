import { Response, NextFunction } from "express"
import { AuthRequest, UserRole } from "./auth"

export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Unauthorized",
      })
      return
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        message: "Forbidden: Access denied",
      })
      return
    }

    next()
  }
}