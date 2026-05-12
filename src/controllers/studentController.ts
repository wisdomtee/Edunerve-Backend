import { Request, Response } from "express"
import bcrypt from "bcrypt"
import prisma from "../prisma"

export const createStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      name,
      email,
      password,
      classId,
    } = req.body

    const existing =
      await prisma.student.findUnique({
        where: { email },
      })

    if (existing) {
      return res.status(400).json({
        message: "Student already exists",
      })
    }

    const hashedPassword =
      await bcrypt.hash(password, 10)

    const student =
      await prisma.student.create({
        data: {
          name,
          email,
          password: hashedPassword,
          classId: Number(classId),
        },
      })

    res.json(student)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to create student",
    })
  }
}

export const getStudents = async (
  req: Request,
  res: Response
) => {
  try {
    const students =
      await prisma.student.findMany({
        include: {
          class: true,
        },
      })

    res.json(students)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to fetch students",
    })
  }
}