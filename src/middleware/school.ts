// src/middleware/school.ts
import { Response, NextFunction } from "express"
import { AuthRequest } from "./auth"

export const requireSchoolUser = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Unauthorized",
    })
  }

  // SUPER_ADMIN can operate without a schoolId
  if (req.user.role === "SUPER_ADMIN") {
    return next()
  }

  if (req.user.schoolId === null || req.user.schoolId === undefined) {
    return res.status(403).json({
      message: "User must belong to a school",
    })
  }

  next()
}

export const enforceSameSchool = (
  req: AuthRequest,
  resourceSchoolId?: number | null
) => {
  if (!req.user) {
    throw new Error("Unauthorized")
  }

  // SUPER_ADMIN can access across schools
  if (req.user.role === "SUPER_ADMIN") {
    return
  }

  if (req.user.schoolId === null || req.user.schoolId === undefined) {
    throw new Error("Forbidden")
  }

  if (resourceSchoolId === null || resourceSchoolId === undefined) {
    throw new Error("Forbidden")
  }

  if (req.user.schoolId !== resourceSchoolId) {
    throw new Error("Forbidden")
  }
}

export const getSchoolFilter = (req: AuthRequest) => {
  if (!req.user) {
    throw new Error("Unauthorized")
  }

  // SUPER_ADMIN sees all schools
  if (req.user.role === "SUPER_ADMIN") {
    return {}
  }

  if (req.user.schoolId === null || req.user.schoolId === undefined) {
    throw new Error("Forbidden")
  }

  return {
    schoolId: req.user.schoolId,
  }
}