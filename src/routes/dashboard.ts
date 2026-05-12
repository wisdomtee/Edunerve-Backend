import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middlewares/auth"

const router = Router()

router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const totalStudents = await prisma.student.count()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const presentToday = await prisma.attendance.count({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
        status: "PRESENT",
      },
    })

    const absentToday = await prisma.attendance.count({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
        status: "ABSENT",
      },
    })

    const lateToday = await prisma.attendance.count({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
        status: "LATE",
      },
    })

    return res.status(200).json({
      totalStudents,
      presentToday,
      absentToday,
      lateToday,
    })
  } catch (error: any) {
    console.error("DASHBOARD STATS ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch dashboard stats",
      error: error.message,
    })
  }
})

router.get("/attendance-week", authMiddleware, async (req, res) => {
  try {
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const attendance = await prisma.attendance.findMany({
      where: {
        date: {
          gte: sevenDaysAgo,
          lte: today,
        },
        status: "PRESENT",
      },
      select: {
        date: true,
      },
      orderBy: {
        date: "asc",
      },
    })

    const grouped: Record<string, number> = {}

    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(sevenDaysAgo.getDate() + i)
      const key = d.toISOString().split("T")[0]
      grouped[key] = 0
    }

    attendance.forEach((item) => {
      const key = item.date.toISOString().split("T")[0]
      if (grouped[key] !== undefined) {
        grouped[key] += 1
      }
    })

    const result = Object.entries(grouped).map(([date, present]) => ({
      date,
      present,
    }))

    return res.status(200).json(result)
  } catch (error: any) {
    console.error("ATTENDANCE WEEK ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch weekly attendance",
      error: error.message,
    })
  }
})

export default router