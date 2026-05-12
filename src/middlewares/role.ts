import { Request, Response, NextFunction } from "express"

export const requireRole = (...roles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    const user = req.user

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    next()
  }
}