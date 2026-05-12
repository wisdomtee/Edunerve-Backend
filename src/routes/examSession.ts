import { Request, Response } from "express"
import prisma from "../prisma"

export const startExam = async (
  req: Request,
  res: Response
) => {
  try {
    const { studentId } = req.body

    const existing = await prisma.examSession.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
      },
    })

    if (existing) {
      return res.json(existing)
    }

    const session = await prisma.examSession.create({
      data: {
        studentId,
      },
    })

    res.json(session)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to start exam",
    })
  }
}

export const closeExam = async (
  req: Request,
  res: Response
) => {
  try {
    const { sessionId } = req.body

    const updated = await prisma.examSession.update({
      where: {
        id: sessionId,
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    })

    res.json(updated)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to close exam",
    })
  }
}