import { Request, Response } from "express"
import prisma from "../prisma"

export const uploadExamQuestions = async (req: Request, res: Response) => {
  try {
    const { title, subject, classId, schoolId, questions } = req.body

    const exam = await prisma.exam.create({
      data: {
        title,
        subject,
        classId,
        schoolId,
        createdBy: 1,
        questions: {
          create: questions,
        },
      },
      include: {
        questions: true,
      },
    })

    return res.json({
      message: "Exam uploaded successfully",
      exam,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}