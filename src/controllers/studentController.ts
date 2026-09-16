import { Request, Response } from "express"
import prisma from "../lib/prisma"
import bcrypt from "bcrypt"
import { AuthRequest } from "../middlewares/auth.middleware"

export const createStudent = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { name, email, password, studentId, classId } = req.body
    const schoolId = req.user?.schoolId

    if (!schoolId) {
      return res.status(400).json({
        message: "No school assigned",
      })
    }

    if (!name || !email || !password || !studentId) {
      return res.status(400).json({
        message: "name, email, password and studentId are required",
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
        school: {
          connect: { id: schoolId },
        },
      },
    })

    return res.json(student)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: "Failed to create student",
    })
  }
}

export const getStudents = async (
  req: Request,
  res: Response
) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        class: true,
      },
    })

    return res.json(students)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: "Failed to fetch students",
    })
  }
}
