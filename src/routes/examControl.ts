import { Request, Response } from "express"
import prisma from "../prisma"

// TEACHER STARTS EXAM
export const startExamControl = async (
  _req: Request,
  res: Response
) => {
  let control = await prisma.examControl.findFirst()

  if (!control) {
    control = await prisma.examControl.create({
      data: {
        isActive: true,
      },
    })
  } else {
    control = await prisma.examControl.update({
      where: { id: control.id },
      data: {
        isActive: true,
      },
    })
  }

  res.json(control)
}

// TEACHER STOPS EXAM
export const stopExamControl = async (
  _req: Request,
  res: Response
) => {
  const control = await prisma.examControl.findFirst()

  if (!control) {
    return res.status(404).json({
      message: "Exam control not found",
    })
  }

  const updated = await prisma.examControl.update({
    where: { id: control.id },
    data: {
      isActive: false,
    },
  })

  res.json(updated)
}

// STUDENT CHECKS STATUS
export const getExamStatus = async (
  _req: Request,
  res: Response
) => {
  const control = await prisma.examControl.findFirst()

  res.json({
    isActive: control?.isActive || false,
  })
}