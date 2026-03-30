import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"

const router = Router()

router.get(
  "/",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== "TEACHER") {
        return res.status(403).json({ message: "Only teachers allowed" })
      }

      const teacher = await prisma.teacher.findUnique({
        where: {
          userId: req.user.id,
        },
        include: {
          classes: {
            include: {
              students: {
                include: {
                  results: true,
                  attendance: true,
                  parent: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                  school: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                  class: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (!teacher) {
        return res.status(404).json({ message: "Teacher record not found" })
      }

      const classes = teacher.classes || []
      const students = classes.flatMap((classItem) => classItem.students || [])

      const totalClasses = classes.length
      const totalStudents = students.length

      const totalResults = students.reduce(
        (sum, student) => sum + (student.results?.length || 0),
        0
      )

      const totalAttendanceRecords = students.reduce(
        (sum, student) => sum + (student.attendance?.length || 0),
        0
      )

      const averageScore =
        totalResults > 0
          ? Number(
              (
                students.reduce((sum, student) => {
                  return (
                    sum +
                    (student.results || []).reduce(
                      (innerSum, result) => innerSum + Number(result.score || 0),
                      0
                    )
                  )
                }, 0) / totalResults
              ).toFixed(2)
            )
          : 0

      return res.json({
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          schoolId: teacher.schoolId,
        },
        stats: {
          totalClasses,
          totalStudents,
          totalResults,
          totalAttendanceRecords,
          averageScore,
        },
        classes,
      })
    } catch (error: any) {
      console.error("Teacher dashboard error:", error)
      return res.status(500).json({
        message: "Failed to load teacher dashboard",
        error: error.message,
      })
    }
  }
)

export default router