import { Request, Response } from "express"
import prisma from "../prisma"

export const saveResult = async (req: Request, res: Response) => {
  try {
    const { studentId, score, total, percentage, answers } = req.body

    const result = await prisma.examResult.create({
      data: {
        studentId,
        score,
        total,
        percentage,
        answers,
      },
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ message: "Error saving result" })
  }
}