import { Request, Response, NextFunction } from "express";

export const authorizeRoles =
  (...roles: string[]) =>
  (req: any, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        message: "Forbidden: Access denied",
      });
    }

    next();
  };