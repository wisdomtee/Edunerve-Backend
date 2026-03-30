import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

function getGrade(averageScore: number) {
  if (averageScore >= 70) return "A"
  if (averageScore >= 60) return "B"
  if (averageScore >= 50) return "C"
  if (averageScore >= 45) return "D"
  return "F"
}

router.get("/student/:studentId", authMiddleware, async (req, res) => {
  try {
    const studentId = Number(req.params.studentId)
    const term = String(req.query.term || "").trim()
    const session = String(req.query.session || "").trim()

    if (isNaN(studentId)) {
      return res.status(400).json({ message: "Invalid student ID" })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        school: true,
      },
    })

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    const results = await prisma.result.findMany({
      where: {
        studentId,
        ...(term ? { term } : {}),
        ...(session ? { session } : {}),
      },
      include: {
        subject: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    const totalScore = results.reduce((sum, item) => sum + Number(item.score || 0), 0)
    const averageScore = results.length ? totalScore / results.length : 0
    const grade = getGrade(averageScore)

    const classStudents = await prisma.student.findMany({
      where: {
        classId: student.classId,
      },
      select: {
        id: true,
        name: true,
        studentId: true,
        results: {
          where: {
            ...(term ? { term } : {}),
            ...(session ? { session } : {}),
          },
          select: {
            score: true,
          },
        },
      },
    })

    const ranking = classStudents
      .map((s) => {
        const total = s.results.reduce((sum, r) => sum + Number(r.score || 0), 0)
        const average = s.results.length ? total / s.results.length : 0

        return {
          studentId: s.id,
          name: s.name,
          average,
        }
      })
      .sort((a, b) => b.average - a.average)

    const positionIndex = ranking.findIndex((item) => item.studentId === studentId)
    const position = positionIndex >= 0 ? positionIndex + 1 : null
    const classSize = classStudents.length

    const passedSubjects = results.filter((item) => Number(item.score) >= 50).length
    const failedSubjects = results.filter((item) => Number(item.score) < 50).length

    return res.status(200).json({
      student: {
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        class: student.class,
        school: student.school,
      },
      report: {
        term,
        session,
        totalSubjects: results.length,
        totalScore,
        averageScore,
        grade,
        position,
        classSize,
        passedSubjects,
        failedSubjects,
        results: results.map((item) => ({
          id: item.id,
          subject: item.subject?.name || "Unknown Subject",
          score: item.score,
          term: item.term,
          session: item.session,
        })),
      },
    })
  } catch (error: any) {
    console.error("GET STUDENT REPORT ERROR:", error)
    return res.status(500).json({
      message: "Failed to generate report",
      error: error.message,
    })
  }
})

export default router