import { Request, Response } from "express"
import prisma from "../prisma"

/* =========================================
   CREATE EXAM + QUESTIONS
========================================= */
export const createExamWithQuestions = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      title,
      subject,
      classId,
      schoolId,
      questions,
    } = req.body

    // Validation
    if (
      !title ||
      !subject ||
      !classId ||
      !schoolId ||
      !questions?.length
    ) {
      return res.status(400).json({
        message: "Missing required fields",
      })
    }

    // Create exam
    const exam = await prisma.exam.create({
      data: {
        title,
        subject,
        classId,
        schoolId,

        // TEMP USER
        createdBy: 1,

        questions: {
          create: questions.map((q: any) => ({
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            answer: q.answer,
          })),
        },
      },

      include: {
        questions: true,
      },
    })

    return res.status(201).json({
      message: "Exam created successfully",
      exam,
    })
  } catch (error: any) {
    console.error("❌ CBT ERROR:", error)

    return res.status(500).json({
      message: "Error creating exam",
      error: error.message,
    })
  }
}

/* =========================================
   GET SINGLE EXAM
========================================= */
export const getExamById = async (req: Request, res: Response) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        questions: true,
      },
    })

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found",
      })
    }

    // 🔀 shuffle questions per request
    const shuffledQuestions = exam.questions
      .map((q) => ({ ...q }))
      .sort(() => Math.random() - 0.5)

    return res.status(200).json({
      exam: {
        ...exam,
        questions: shuffledQuestions,
      },
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}