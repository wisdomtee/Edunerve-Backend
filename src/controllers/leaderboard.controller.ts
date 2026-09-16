import { Request, Response } from "express"
import prisma from "../prisma"

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const results = await prisma.examAttempt.findMany({
      where: {
        status: "COMPLETED",
      },
      orderBy: {
        score: "desc",
      },
    })

    const leaderboard = await Promise.all(
      results.map(async (r) => {
        const student = await prisma.student.findUnique({
          where: { id: r.studentId },
          select: { name: true },
        })
        return {
          student: student?.name || `Student ${r.studentId}`,
          score: r.score,
          percentage: r.percentage,
        }
      })
    )

    return res.json({
      leaderboard,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}
