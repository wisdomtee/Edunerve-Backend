import jwt from "jsonwebtoken"

export function generateToken(payload: { id: string; email: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  })
}