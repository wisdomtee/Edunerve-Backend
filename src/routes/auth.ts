import { Router } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "../prisma"

const router = Router()

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    console.log("LOGIN ATTEMPT:", email)

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    const isValid = await bcrypt.compare(password, user.password)

    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    )

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email
      }
    })
  } catch (error: any) {
    console.error("LOGIN ERROR:", error)
    return res.status(500).json({
      message: "Login failed",
      error: error?.message || "Unknown error"
    })
  }
})

export default router