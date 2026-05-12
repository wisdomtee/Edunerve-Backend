import { Request, Response } from "express"
import prisma from "../prisma"

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params

    const results = await prisma.examAttempt.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        student: true,
      },
      orderBy: {
        score: "desc",
      },
    })

    const leaderboard = results.map((r) => ({
      student: r.student.name,
      score: r.score,
      percentage: r.percentage,
    }))

    return res.json({
      leaderboard,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}