import { Request, Response } from "express"
import bcrypt from "bcrypt"
import prisma from "../prisma"
import { generateToken } from "../utils/jwt"

/**
 * REGISTER USER (SCHOOL-AWARE OPTIONAL)
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, schoolCode } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      })
    }

    const normalizedEmail = email.toLowerCase()

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    let school = null

    if (schoolCode) {
      school = await prisma.school.findUnique({
        where: { schoolCode: schoolCode.trim() },
      })

      if (!school) {
        return res.status(400).json({
          message: "Invalid school code",
        })
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
        schoolId: school ? school.id : null,
        role: "USER",
      },
    })

    const token = generateToken({
      id: user.id,
      schoolId: user.schoolId,
      role: user.role,
    })

    const { password: _, ...safeUser } = user

    return res.status(201).json({
      user: safeUser,
      token,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Registration failed",
    })
  }
}

/**
 * LOGIN USER (SCHOOL-BASED SAAS LOGIN)
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { schoolCode, email, password } = req.body

    if (!schoolCode || !email || !password) {
      return res.status(400).json({
        message: "School code, email and password are required",
      })
    }

    const school = await prisma.school.findUnique({
      where: { schoolCode: schoolCode.trim() },
    })

    if (!school) {
      return res.status(400).json({
        message: "Invalid school code",
      })
    }

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        schoolId: school.id,
      },
    })

    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      })
    }

    const token = generateToken({
      id: user.id,
      schoolId: school.id,
      role: user.role,
    })

    const { password: _, ...safeUser } = user

    return res.json({
      user: safeUser,
      token,
      school,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Login failed",
    })
  }
}