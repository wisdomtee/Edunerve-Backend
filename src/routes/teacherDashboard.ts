import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.get("/teacher/dashboard", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== "TEACHER") {
      return res.status(403).json({ message: "Only teachers allowed" })
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user.id },
      include: {
        classes: {
          include: {
            students: {
              include: {
                results: true,
                attendances: true,
              },
            },
          },
        },
      },
    })

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" })
    }

    const students = teacher.classes.flatMap((c) => c.students)

    // ===== Attendance Trend =====
    const attendanceMap: any = {}

    students.forEach((student) => {
      student.attendances.forEach((a) => {
        const date = new Date(a.date).toISOString().split("T")[0]

        if (!attendanceMap[date]) {
          attendanceMap[date] = { date, present: 0, absent: 0, late: 0 }
        }

        const status = a.status.toUpperCase()

        if (status === "PRESENT") attendanceMap[date].present++
        else if (status === "ABSENT") attendanceMap[date].absent++
        else attendanceMap[date].late++
      })
    })

    const attendanceTrend = Object.values(attendanceMap)

    // ===== Subject Performance =====
    const subjectMap: any = {}

    students.forEach((student) => {
      student.results.forEach((r) => {
        const subject = r.subjectId

        if (!subjectMap[subject]) {
          subjectMap[subject] = { subject: `Subject ${subject}`, total: 0, count: 0 }
        }

        subjectMap[subject].total += r.score
        subjectMap[subject].count++
      })
    })

    const performanceBySubject = Object.values(subjectMap).map((s: any) => ({
      subject: s.subject,
      averageScore: Math.round(s.total / s.count),
      count: s.count,
    }))

    // ===== Class Distribution =====
    const classDistribution = teacher.classes.map((cls) => ({
      name: cls.name,
      value: cls.students.length,
    }))

    // ===== Performance Trend =====
    const monthMap: any = {}

    students.forEach((student) => {
      student.results.forEach((r) => {
        const month = new Date(r.createdAt).toLocaleString("default", {
          month: "short",
        })

        if (!monthMap[month]) {
          monthMap[month] = { month, total: 0, count: 0 }
        }

        monthMap[month].total += r.score
        monthMap[month].count++
      })
    })

    const performanceTrend = Object.values(monthMap).map((m: any) => ({
      month: m.month,
      averageScore: Math.round(m.total / m.count),
    }))

    return res.json({
      charts: {
        attendanceTrend,
        performanceBySubject,
        classDistribution,
        performanceTrend,
      },
    })
  } catch (error: any) {
    console.error("Teacher dashboard error:", error)
    res.status(500).json({ message: "Error", error: error.message })
  }
})

export default router