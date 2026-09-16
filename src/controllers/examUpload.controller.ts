import { Request, Response } from "express"
import prisma from "../lib/prisma"

export const uploadExam = async (req: Request, res: Response) => {
  try {
    const {
      title,
      subject,
      classId,
      className,
      schoolId,
      createdBy,
      duration,
      questions,
    } = req.body

    if (!title || !subject || !classId || !schoolId || !createdBy || !duration) {
      return res.status(400).json({
        message: "Missing required exam fields",
      })
    }

    const parsedQuestions = Array.isArray(questions) ? questions : []

    const exam = await prisma.exam.create({
      data: {
        title,
        subject,
        classId: Number(classId),
        className: className ?? "",
        schoolId: Number(schoolId),
        createdBy: Number(createdBy),
        duration: Number(duration),
        questions: {
          create: parsedQuestions.map((q: any) => ({
            text: q.text ?? "",
            question: q.question ?? "",
            optionA: q.optionA ?? "",
            optionB: q.optionB ?? "",
            optionC: q.optionC ?? "",
            optionD: q.optionD ?? "",
            answer: q.answer ?? "",
            subject: q.subject ?? null,
            class: q.class ?? null,
          })),
        },
      },
      include: {
        questions: true,
      },
    })

    return res.status(201).json({
      message: "Exam uploaded successfully",
      exam,
    })
  } catch (error: any) {
    console.error("Exam upload error:", error)

    return res.status(500).json({
      message: "Failed to upload exam",
      error: error.message,
    })
  }
}