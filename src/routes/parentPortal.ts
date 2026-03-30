import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"

const router = Router()

function getOrdinal(position: number | null) {
  if (!position) return "—"

  const mod10 = position % 10
  const mod100 = position % 100

  if (mod10 === 1 && mod100 !== 11) return `${position}st`
  if (mod10 === 2 && mod100 !== 12) return `${position}nd`
  if (mod10 === 3 && mod100 !== 13) return `${position}rd`
  return `${position}th`
}

router.get(
  "/children",
  authMiddleware,
  authorizeRoles("PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          message: "Unauthorized",
        })
      }

      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
      })

      if (!currentUser) {
        return res.status(404).json({
          message: "User not found",
        })
      }

      let parent = await prisma.parent.findUnique({
        where: {
          userId: req.user.id,
        },
        include: {
          students: {
            include: {
              school: true,
              class: true,
              results: {
                include: {
                  subject: true,
                  teacher: true,
                },
                orderBy: {
                  createdAt: "desc",
                },
              },
              attendance: {
                orderBy: {
                  date: "desc",
                },
              },
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      })

      // Auto-create parent profile if missing
      if (!parent) {
        if (!currentUser.schoolId) {
          return res.status(400).json({
            message: "Parent user has no school assigned",
          })
        }

        parent = await prisma.parent.create({
          data: {
            userId: currentUser.id,
            schoolId: currentUser.schoolId,
            name: currentUser.name || "Parent",
            email: currentUser.email,
            phone: null,
          },
          include: {
            students: {
              include: {
                school: true,
                class: true,
                results: {
                  include: {
                    subject: true,
                    teacher: true,
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                },
                attendance: {
                  orderBy: {
                    date: "desc",
                  },
                },
              },
              orderBy: {
                name: "asc",
              },
            },
          },
        })
      }

      const childrenWithStats = await Promise.all(
        parent.students.map(async (student) => {
          const totalScore = student.results.reduce(
            (sum, result) => sum + Number(result.score || 0),
            0
          )

          const averageScore =
            student.results.length > 0 ? totalScore / student.results.length : 0

          const attendanceSummary = {
            total: student.attendance.length,
            present: student.attendance.filter(
              (item) => item.status?.toUpperCase() === "PRESENT"
            ).length,
            absent: student.attendance.filter(
              (item) => item.status?.toUpperCase() === "ABSENT"
            ).length,
            late: student.attendance.filter(
              (item) => item.status?.toUpperCase() === "LATE"
            ).length,
          }

          let ranking = {
            position: null as number | null,
            positionText: "—",
            totalStudents: 0,
          }

          if (student.classId) {
            const classmates = await prisma.student.findMany({
              where: {
                classId: student.classId,
                schoolId: student.schoolId ?? undefined,
              },
              include: {
                results: true,
              },
            })

            const ranked = classmates
              .map((classmate) => {
                const total = classmate.results.reduce(
                  (sum, result) => sum + Number(result.score || 0),
                  0
                )

                const avg =
                  classmate.results.length > 0
                    ? total / classmate.results.length
                    : 0

                return {
                  id: classmate.id,
                  name: classmate.name,
                  studentId: classmate.studentId,
                  averageScore: Number(avg.toFixed(2)),
                }
              })
              .sort((a, b) => {
                if (b.averageScore !== a.averageScore) {
                  return b.averageScore - a.averageScore
                }

                return a.name.localeCompare(b.name)
              })

            const position = ranked.findIndex((item) => item.id === student.id) + 1

            ranking = {
              position: position || null,
              positionText: position ? getOrdinal(position) : "—",
              totalStudents: ranked.length,
            }
          }

          return {
            id: student.id,
            name: student.name,
            studentId: student.studentId,
            schoolId: student.schoolId,
            classId: student.classId,
            class: student.class
              ? {
                  id: student.class.id,
                  name: student.class.name,
                }
              : null,
            school: student.school
              ? {
                  id: student.school.id,
                  name: student.school.name,
                }
              : null,
            results: student.results,
            attendance: student.attendance,
            averageScore: Number(averageScore.toFixed(2)),
            attendanceSummary,
            ranking,
            createdAt: student.createdAt,
            updatedAt: student.updatedAt,
          }
        })
      )

      return res.status(200).json({
        parent: {
          id: parent.id,
          name: parent.name,
          email: parent.email,
          phone: parent.phone,
        },
        children: childrenWithStats,
      })
    } catch (error: any) {
      console.error("GET /parent-portal/children error:", error)
      return res.status(500).json({
        message: "Failed to fetch parent portal data",
        error: error.message,
      })
    }
  }
)

export default router