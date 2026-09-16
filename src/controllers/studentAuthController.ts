import { Request, Response } from "express"
import prisma from "../lib/prisma"
import bcrypt from "bcrypt"
import { AuthRequest } from "../middlewares/auth.middleware"
import { generateToken } from "../utils/jwt"

export const registerStudent = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { name, email, password, studentId, classId } = req.body
    const schoolId = req.user?.schoolId

    const existing = await prisma.student.findUnique({
      where: { email },
    })

    if (existing) {
      return res.status(400).json({
        message: "Student already exists",
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const student = await prisma.student.create({
      data: {
        name,
        email,
        password: hashedPassword,
        studentId,
        class: classId
          ? { connect: { id: Number(classId) } }
          : undefined,
        school: schoolId
          ? { connect: { id: Number(schoolId) } }
          : undefined,
      },
    })

    return res.json({
      message: "Student registered",
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        schoolId: student.schoolId,
        classId: student.classId,
      },
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
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

    const student = await prisma.student.findUnique({
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

    const token = generateToken({
      id: student.id,
      email: student.email,
      schoolId: student.schoolId,
      role: "STUDENT",
    })

    return res.json({
      message: "Login successful",
      token,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        schoolId: student.schoolId,
        classId: student.classId,
      },
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: "Server error",
    })
  }
}
