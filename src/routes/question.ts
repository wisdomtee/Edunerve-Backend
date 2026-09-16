import { Request, Response } from "express"
import prisma from "../prisma"

export const getQuestions = async (
  _req: Request,
  res: Response
) => {
  try {
    const questions = await prisma.question.findMany({
      orderBy: {
        id: "desc",
      },
    })

    res.json(questions)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Failed to fetch questions",
    })
  }
}

export const createQuestion = async (
  req: Request,
  res: Response
) => {
  try {
    const { examId, text, question, options, answer } = req.body

    const questionText = text || question

    if (
      !examId ||
      !questionText ||
      !Array.isArray(options) ||
      options.length < 4 ||
      !answer
    ) {
      return res.status(400).json({
        message: "examId, question text, four options and answer are required",
      })
    }

    const newQuestion = await prisma.question.create({
      data: {
        text: questionText,
        question: questionText,
        optionA: options[0],
        optionB: options[1],
        optionC: options[2],
        optionD: options[3],
        answer,
        exam: {
          connect: { id: Number(examId) },
        },
      },
    })

    return res.status(201).json(newQuestion)
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      message: "Failed to create question",
    })
  }
}
