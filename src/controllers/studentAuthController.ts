import { Request, Response } from "express"
import bcrypt from "bcrypt"
import prisma from "../prisma"
import { generateToken } from "../utils/jwt"

export const registerStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const { name, email, password, classId } =
      req.body

    const existing =
      await prisma.student.findUnique({
        where: { email },
      })

    if (existing) {
      return res
        .status(400)
        .json({ message: "Student already exists" })
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    )

    const student =
      await prisma.student.create({
        data: {
          name,
          email,
          password: hashedPassword,
          classId,
        },
      })

    res.json({
      message: "Student registered",
      student,
    })
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Server error",
    })
  }
}

export const loginStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const { email, password } = req.body

    const student =
      await prisma.student.findUnique({
        where: { email },
      })

    if (!student) {
      return res.status(400).json({
        message: "Invalid credentials",
      })
    }

    const validPassword = await bcrypt.compare(
      password,
      student.password
    )

    if (!validPassword) {
      return res.status(400).json({
        message: "Invalid credentials",
      })
    }

    const token = generateToken(student.id)

    res.json({
      token,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        classId: student.classId,
      },
    })
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Server error",
    })
  }
}