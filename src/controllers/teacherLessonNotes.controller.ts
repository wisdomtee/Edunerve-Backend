import { Request, Response } from "express"
import prisma from "../prisma"

export const createLessonNote = async (req: Request, res: Response) => {
  try {
    const {
      title,
      content,
      subject,
      classId,
      week,
      term,
      schoolId,
    } = req.body

    const teacherId = (req as any).user.id

    const lessonNote = await prisma.lessonNote.create({
      data: {
        title,
        content,
        subject,
        classId,
        week,
        term,
        schoolId,
        teacherId,
        status: "PENDING",
      },
    })

    return res.status(201).json({
      message: "Lesson note submitted for approval",
      lessonNote,
    })
  } catch (error) {
    return res.status(500).json({ message: "Server error" })
  }
}