import { Request, Response } from "express"
import prisma from "../prisma"

/**
 * GET ALL PENDING LESSON NOTES (ADMIN)
 */
export const getPendingLessonNotes = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user

    const notes = await prisma.lessonNote.findMany({
      where: {
        schoolId: admin.schoolId,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json({
      message: "Pending lesson notes fetched",
      notes,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch pending lesson notes",
    })
  }
}

/**
 * REVIEW LESSON NOTE (ADMIN)
 */
export const reviewLessonNote = async (req: Request, res: Response) => {
  try {
    const { noteId, status, comment } = req.body

    const updated = await prisma.lessonNote.update({
      where: { id: noteId },
      data: {
        status,
        adminComment: comment,
      },
    })

    return res.json({
      message: "Lesson note reviewed successfully",
      updated,
    })
  } catch (error) {
    return res.status(500).json({
      message: "Failed to review lesson note",
    })
  }
}