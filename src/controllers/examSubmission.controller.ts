import { Request, Response } from "express"
import prisma from "../prisma"

export const submitExamAttempt = async (req: Request, res: Response) => {
  try {
    const { examId, studentId, answers } = req.body

    const attempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: {
          examId,
          studentId,
        },
      },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
      },
    })

    if (!attempt) {
      return res.status(404).json({
        message: "No attempt found",
      })
    }

    const exam = attempt.exam
    const now = new Date()

    // ✅ TIMER VALIDATION (PASTE HERE)
    if (exam.startTime && now < exam.startTime) {
      return res.status(403).json({
        message: "Exam has not started yet",
      })
    }

    if (exam.endTime && now > exam.endTime) {
      return res.status(403).json({
        message: "Exam has ended",
      })
    }

    // ✅ SCORING LOGIC
    let score = 0
    const total = exam.questions.length

    exam.questions.forEach((q) => {
      const answer = answers.find(
        (a: any) => a.questionId === q.id
      )

      if (answer && answer.selected === q.answer) {
        score++
      }
    })

    const percentage = total === 0 ? 0 : (score / total) * 100

    const updated = await prisma.examAttempt.update({
      where: {
        id: attempt.id,
      },
      data: {
        score,
        total,
        percentage,
        status: "COMPLETED",
        submittedAt: new Date(),
      },
    })

    return res.json({
      message: "Exam submitted successfully",
      result: updated,
    })
  } catch (error: any) {
    console.error(error)
    return res.status(500).json({
      message: error.message,
    })
  }
}