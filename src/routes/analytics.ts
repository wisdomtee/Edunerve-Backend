import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.use(authMiddleware)

type RiskLevel = "low" | "medium" | "high"

type RiskSignal = {
  level: RiskLevel
  title: string
  message: string
}

function getRiskLevel(score: number, attendanceRate: number): RiskLevel {
  if (score < 50 || attendanceRate < 60) return "high"
  if (score < 65 || attendanceRate < 75) return "medium"
  return "low"
}

// GET /analytics/dashboard?class=JSS1&term=1&startDate=2026-01-01&endDate=2026-03-31
router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const classFilter = String(req.query.class || "").trim()
    const termFilter = String(req.query.term || "").trim()
    const startDate = String(req.query.startDate || "").trim()
    const endDate = String(req.query.endDate || "").trim()

    const start = startDate ? new Date(startDate) : null
    const end = endDate ? new Date(endDate) : null

    if (end) {
      end.setHours(23, 59, 59, 999)
    }

    const schoolScoped = user.role !== "SUPER_ADMIN"

    if (schoolScoped && !user.schoolId) {
      return res.status(400).json({
        message: "No school assigned to this user",
      })
    }

    const studentWhere: any = schoolScoped ? { schoolId: user.schoolId } : {}
    const classWhere: any = schoolScoped ? { schoolId: user.schoolId } : {}
    const resultWhere: any = schoolScoped ? { schoolId: user.schoolId } : {}
    const teacherWhere: any = schoolScoped
      ? { schoolId: user.schoolId, role: "TEACHER" }
      : { role: "TEACHER" }

    if (classFilter) {
      studentWhere.class = { name: classFilter }
      classWhere.name = classFilter
      resultWhere.student = {
        class: {
          name: classFilter,
        },
      }
    }

    if (termFilter) {
      resultWhere.term = termFilter
    }

    if (start || end) {
      if (start || end) {
        resultWhere.createdAt = {}
        if (start) resultWhere.createdAt.gte = start
        if (end) resultWhere.createdAt.lte = end
      }
    }

    const [students, teachers, classes, schools, results, attendanceRecords] =
      await Promise.all([
        prisma.student.findMany({
          where: studentWhere,
          include: {
            class: true,
          },
        }),
        prisma.user.findMany({
          where: teacherWhere,
        }),
        prisma.class.findMany({
          where: classWhere,
        }),
        prisma.school.findMany(),
        prisma.result.findMany({
          where: resultWhere,
          include: {
            student: {
              include: {
                class: true,
              },
            },
            subject: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        }),
        prisma.attendance.findMany({
          where: {
            ...(start || end
              ? {
                  date: {
                    ...(start ? { gte: start } : {}),
                    ...(end ? { lte: end } : {}),
                  },
                }
              : {}),
            ...(schoolScoped
              ? {
                  student: {
                    schoolId: user.schoolId,
                    ...(classFilter
                      ? {
                          class: {
                            name: classFilter,
                          },
                        }
                      : {}),
                  },
                }
              : classFilter
              ? {
                  student: {
                    class: {
                      name: classFilter,
                    },
                  },
                }
              : {}),
          },
          include: {
            student: {
              include: {
                class: true,
              },
            },
          },
          orderBy: {
            date: "asc",
          },
        }),
      ])

    const summary = {
      schools: user.role === "SUPER_ADMIN" ? schools.length : 1,
      students: students.length,
      teachers: teachers.length,
      classes: classes.length,
      results: results.length,
      attendance: attendanceRecords.length,
    }

    const attendanceMap: Record<
      string,
      { date: string; present: number; absent: number; late: number }
    > = {}

    for (const record of attendanceRecords) {
      const dateKey = new Date(record.date).toISOString().split("T")[0]

      if (!attendanceMap[dateKey]) {
        attendanceMap[dateKey] = {
          date: dateKey,
          present: 0,
          absent: 0,
          late: 0,
        }
      }

      const status = String(record.status || "").toUpperCase()

      if (status === "PRESENT") attendanceMap[dateKey].present += 1
      else if (status === "ABSENT") attendanceMap[dateKey].absent += 1
      else if (status === "LATE") attendanceMap[dateKey].late += 1
    }

    const attendanceTrend = Object.values(attendanceMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)

    const subjectMap: Record<
      string,
      { subject: string; total: number; count: number }
    > = {}

    for (const result of results) {
      const subjectName = result.subject?.name || "Unknown Subject"

      if (!subjectMap[subjectName]) {
        subjectMap[subjectName] = {
          subject: subjectName,
          total: 0,
          count: 0,
        }
      }

      subjectMap[subjectName].total += Number(result.score || 0)
      subjectMap[subjectName].count += 1
    }

    const performanceBySubject = Object.values(subjectMap).map((item) => ({
      subject: item.subject,
      averageScore: item.count > 0 ? Math.round(item.total / item.count) : 0,
      count: item.count,
    }))

    const classMap: Record<string, { name: string; value: number }> = {}

    for (const student of students) {
      const className = student.class?.name || "Unassigned"

      if (!classMap[className]) {
        classMap[className] = {
          name: className,
          value: 0,
        }
      }

      classMap[className].value += 1
    }

    const classDistribution = Object.values(classMap)

    const monthlyMap: Record<
      string,
      { month: string; total: number; count: number }
    > = {}

    for (const result of results) {
      const createdAt = new Date(result.createdAt)
      const monthKey = `${createdAt.getFullYear()}-${String(
        createdAt.getMonth() + 1
      ).padStart(2, "0")}`

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          month: monthKey,
          total: 0,
          count: 0,
        }
      }

      monthlyMap[monthKey].total += Number(result.score || 0)
      monthlyMap[monthKey].count += 1
    }

    const performanceTrend = Object.values(monthlyMap)
      .map((item) => ({
        month: item.month,
        averageScore: item.count > 0 ? Math.round(item.total / item.count) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)

    const availableClasses = Array.from(
      new Set(students.map((student) => student.class?.name).filter(Boolean))
    ) as string[]

    const insights: string[] = []

    if (attendanceTrend.length >= 2) {
      const last = attendanceTrend[attendanceTrend.length - 1]
      const prev = attendanceTrend[attendanceTrend.length - 2]

      const lastTotal = last.present + last.absent + last.late
      const prevTotal = prev.present + prev.absent + prev.late

      if (prevTotal > 0) {
        const change = ((last.present - prev.present) / prevTotal) * 100

        if (change < -10) {
          insights.push("⚠️ Attendance dropped significantly recently")
        } else if (change > 10) {
          insights.push("✅ Attendance improved recently")
        }
      }

      if (lastTotal > 0) {
        const lateRate = (last.late / lastTotal) * 100
        if (lateRate >= 20) {
          insights.push("⏰ Lateness is high in the most recent attendance data")
        }
      }
    }

    if (performanceBySubject.length > 0) {
      const sortedSubjects = [...performanceBySubject].sort(
        (a, b) => a.averageScore - b.averageScore
      )

      const weakest = sortedSubjects[0]
      const strongest = sortedSubjects[sortedSubjects.length - 1]

      if (weakest) {
        insights.push(`📉 ${weakest.subject} is the weakest subject`)
      }

      if (strongest) {
        insights.push(`🏆 ${strongest.subject} is the best performing subject`)
      }

      const lowSubjects = performanceBySubject.filter(
        (item) => item.averageScore < 50
      )

      if (lowSubjects.length > 0) {
        insights.push("🚨 Some subjects are below the 50% average mark")
      }
    }

    if (classDistribution.length > 0) {
      const sortedClasses = [...classDistribution].sort(
        (a, b) => b.value - a.value
      )
      const topClass = sortedClasses[0]

      if (topClass) {
        insights.push(`👥 ${topClass.name} has the highest student population`)
      }
    }

    if (performanceTrend.length >= 2) {
      const lastPerf = performanceTrend[performanceTrend.length - 1]
      const prevPerf = performanceTrend[performanceTrend.length - 2]

      if (lastPerf.averageScore > prevPerf.averageScore) {
        insights.push("📈 Academic performance is trending upward")
      } else if (lastPerf.averageScore < prevPerf.averageScore) {
        insights.push("📉 Academic performance is trending downward")
      }
    }

    return res.json({
      insights,
      filters: {
        selectedClass: classFilter || "",
        selectedTerm: termFilter || "",
        startDate: startDate || "",
        endDate: endDate || "",
        availableClasses,
      },
      summary,
      charts: {
        attendanceTrend,
        performanceBySubject,
        classDistribution,
        performanceTrend,
      },
    })
  } catch (error) {
    console.error("Analytics dashboard error:", error)
    return res.status(500).json({ message: "Failed to load analytics dashboard" })
  }
})

// GET /analytics/parent-child
router.get("/parent-child", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    if (user.role !== "PARENT") {
      return res.status(403).json({ message: "Access denied" })
    }

    const parent = await prisma.parent.findUnique({
      where: {
        userId: user.id,
      },
    })

    if (!parent) {
      return res.json({
        student: null,
        results: [],
        attendance: [],
      })
    }

    const student = await prisma.student.findFirst({
      where: {
        parentId: parent.id,
      },
      include: {
        class: true,
        school: true,
      },
    })

    if (!student) {
      return res.json({
        student: null,
        results: [],
        attendance: [],
      })
    }

    const [results, attendance] = await Promise.all([
      prisma.result.findMany({
        where: {
          studentId: student.id,
        },
        include: {
          subject: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
        },
        orderBy: {
          date: "desc",
        },
      }),
    ])

    return res.json({
      student,
      results,
      attendance,
    })
  } catch (error) {
    console.error("Parent child error:", error)
    return res.status(500).json({ message: "Failed to load child data" })
  }
})

// GET /analytics/parent-risk
router.get("/parent-risk", async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    if (user.role !== "PARENT") {
      return res.status(403).json({ message: "Access denied" })
    }

    const parent = await prisma.parent.findUnique({
      where: {
        userId: user.id,
      },
    })

    if (!parent) {
      return res.json({
        student: null,
        overallRisk: "low",
        averageScore: null,
        attendanceRate: null,
        weakSubjects: [],
        signals: [],
        recommendations: [],
      })
    }

    const student = await prisma.student.findFirst({
      where: {
        parentId: parent.id,
      },
      include: {
        class: true,
        school: true,
      },
    })

    if (!student) {
      return res.json({
        student: null,
        overallRisk: "low",
        averageScore: null,
        attendanceRate: null,
        weakSubjects: [],
        signals: [],
        recommendations: [],
      })
    }

    const [results, attendance] = await Promise.all([
      prisma.result.findMany({
        where: {
          studentId: student.id,
        },
        include: {
          subject: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: student.id,
        },
        orderBy: {
          date: "desc",
        },
      }),
    ])

    const averageScore =
      results.length > 0
        ? Math.round(
            results.reduce((sum, item) => sum + Number(item.score || 0), 0) /
              results.length
          )
        : null

    const presentCount = attendance.filter(
      (item) => String(item.status || "").toUpperCase() === "PRESENT"
    ).length

    const attendanceRate =
      attendance.length > 0
        ? Math.round((presentCount / attendance.length) * 100)
        : null

    const subjectMap: Record<string, { total: number; count: number }> = {}

    for (const item of results) {
      const subjectName = item.subject?.name || "Unknown Subject"

      if (!subjectMap[subjectName]) {
        subjectMap[subjectName] = { total: 0, count: 0 }
      }

      subjectMap[subjectName].total += Number(item.score || 0)
      subjectMap[subjectName].count += 1
    }

    const subjectAverages = Object.entries(subjectMap).map(
      ([subject, value]) => ({
        subject,
        averageScore:
          value.count > 0 ? Math.round(value.total / value.count) : 0,
      })
    )

    const weakSubjects = subjectAverages.filter((item) => item.averageScore < 50)

    const signals: RiskSignal[] = []

    if (averageScore !== null) {
      if (averageScore < 50) {
        signals.push({
          level: "high",
          title: "Low academic average",
          message:
            "Average score is below 50%. Immediate support is recommended.",
        })
      } else if (averageScore < 65) {
        signals.push({
          level: "medium",
          title: "Academic performance needs attention",
          message: "Average score is below 65%. Performance should be monitored.",
        })
      }
    }

    if (attendanceRate !== null) {
      if (attendanceRate < 60) {
        signals.push({
          level: "high",
          title: "Critical attendance risk",
          message:
            "Attendance is below 60%. This may strongly affect performance.",
        })
      } else if (attendanceRate < 75) {
        signals.push({
          level: "medium",
          title: "Attendance risk detected",
          message: "Attendance is below 75%. Consistency should improve.",
        })
      }
    }

    if (weakSubjects.length > 0) {
      signals.push({
        level: weakSubjects.length >= 2 ? "high" : "medium",
        title: "Weak subject performance",
        message: `Student is struggling in ${weakSubjects
          .map((item) => item.subject)
          .join(", ")}.`,
      })
    }

    const recommendations: string[] = []

    if (averageScore !== null && averageScore < 50) {
      recommendations.push(
        "Increase study time and consider extra lessons or tutoring."
      )
    }

    if (attendanceRate !== null && attendanceRate < 75) {
      recommendations.push(
        "Ensure consistent school attendance to improve academic performance."
      )
    }

    if (weakSubjects.length > 0) {
      weakSubjects.forEach((sub) => {
        recommendations.push(
          `Focus on improving ${sub.subject} through revision and practice.`
        )
      })
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Keep up the current performance and maintain consistent attendance."
      )
    }

    const overallRisk = getRiskLevel(
      averageScore ?? 100,
      attendanceRate ?? 100
    )

    if (overallRisk === "high") {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "High Risk Alert",
          message: "Your child is at high academic or attendance risk.",
        },
      })
    }

    return res.json({
      student,
      overallRisk,
      averageScore,
      attendanceRate,
      weakSubjects,
      signals,
      recommendations,
    })
  } catch (error) {
    console.error("Parent risk error:", error)
    return res.status(500).json({ message: "Failed to load parent risk data" })
  }
})

export default router