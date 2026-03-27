import { Response, NextFunction } from "express"
import { AuthRequest } from "./auth"

// =======================
// REQUIRE SCHOOL USER
// =======================
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

  if (!req.user.schoolId) {
    return res.status(400).json({
      message: "No school assigned to this user",
    })
  }

  next()
}

// =======================
// FILTER BY SCHOOL
// =======================
export const getSchoolFilter = (req: AuthRequest) => {
  if (!req.user?.schoolId) {
    throw new Error("No school assigned to this user")
  }

  return {
    schoolId: req.user.schoolId,
  }
}

// =======================
// ENSURE SAME SCHOOL
// =======================
export const enforceSameSchool = (
  req: AuthRequest,
  resourceSchoolId: number
) => {
  if (!req.user?.schoolId) {
    throw new Error("Forbidden")
  }

  if (req.user.schoolId !== resourceSchoolId) {
    throw new Error("Forbidden")
  }
}