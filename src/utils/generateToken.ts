import jwt from "jsonwebtoken"

export const generateToken = (payload: {
  id: number
  email: string
  schoolId: number
  role: string
}) => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  })
}