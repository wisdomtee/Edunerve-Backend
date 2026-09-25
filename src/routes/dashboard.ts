import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middlewares/auth"

const router = Router()

router.get("/stats", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    /*
     * School admins, teachers, parents and students are scoped
     * to their own school. Super admins can see global totals.
     */
    const schoolId =
      user.role === "SUPER_ADMIN"
        ? undefined
        : user.schoolId

    if (
      user.role !== "SUPER_ADMIN" &&
      !schoolId
    ) {
      return res.status(400).json({
        message: "No school assigned to this user",
      })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      presentToday,
      absentToday,
      lateToday,
    ] = await Promise.all([
      prisma.student.count({
        where: schoolId
          ? { schoolId }
          : undefined,
      }),

      prisma.teacher.count({
        where: schoolId
          ? { schoolId }
          : undefined,
      }),

      prisma.class.count({
        where: schoolId
          ? { schoolId }
          : undefined,
      }),

      prisma.attendance.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
          status: "PRESENT",
          ...(schoolId
            ? {
                student: {
                  schoolId,
                },
              }
            : {}),
        },
      }),

      prisma.attendance.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
          status: "ABSENT",
          ...(schoolId
            ? {
                student: {
                  schoolId,
                },
              }
            : {}),
        },
      }),

      prisma.attendance.count({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
          status: "LATE",
          ...(schoolId
            ? {
                student: {
                  schoolId,
                },
              }
            : {}),
        },
      }),
    ])

    return res.status(200).json({
      totalStudents,
      totalTeachers,
      totalClasses,
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

router.get("/attendance-week", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    const schoolId =
      user.role === "SUPER_ADMIN"
        ? undefined
        : user.schoolId

    if (
      user.role !== "SUPER_ADMIN" &&
      !schoolId
    ) {
      return res.status(400).json({
        message: "No school assigned to this user",
      })
    }

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
        ...(schoolId
          ? {
              student: {
                schoolId,
              },
            }
          : {}),
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

    const result = Object.entries(grouped).map(
      ([date, present]) => ({
        date,
        present,
      })
    )

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
