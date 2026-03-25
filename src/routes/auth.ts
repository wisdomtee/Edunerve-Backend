import { Router } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import prisma from "../prisma"

const router = Router()

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      })
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      })
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    )

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error: any) {
    console.error("LOGIN ERROR:", error)

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    })
  }
})

export default router