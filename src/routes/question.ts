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
    const { question, options, answer } = req.body

    const newQuestion = await prisma.question.create({
      data: {
        question,
        options,
        answer,
      },
    })

    res.json(newQuestion)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Failed to create question",
    })
  }
}