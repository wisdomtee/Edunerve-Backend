import jwt from "jsonwebtoken"

interface TokenPayload {
  id: number
  email: string
  schoolId: number | null
  role: string
}

export const generateToken = (payload: TokenPayload) => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  })
}