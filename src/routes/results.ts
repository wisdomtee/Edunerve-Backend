import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

// GET ALL RESULTS
router.get("/", authMiddleware, async (_req, res) => {
  try {
    const results = await prisma.result.findMany({
      include: {
        student: true,
        subject: true,
        teacher: true,
        school: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.status(200).json({ results })
  } catch (error: any) {
    console.error("GET RESULTS ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch results",
      error: error.message,
    })
  }
})

// GET RESULTS FOR ONE STUDENT
router.get("/student/:studentId", authMiddleware, async (req, res) => {
  try {
    const studentId = Number(req.params.studentId)

    const results = await prisma.result.findMany({
      where: { studentId },
      include: {
        subject: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.json({ results })
  } catch (error: any) {
    console.error("GET STUDENT RESULTS ERROR:", error)

    return res.status(500).json({
      message: "Failed to fetch student results",
      error: error.message,
    })
  }
})

// CREATE RESULT
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { studentId, subjectId, teacherId, schoolId, score, term, session } = req.body

    if (!studentId || !subjectId || score === undefined || score === null) {
      return res.status(400).json({
        message: "studentId, subjectId and score are required",
      })
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
    })

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
    })

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" })
    }

    let teacher = null
    if (teacherId) {
      teacher = await prisma.teacher.findUnique({
        where: { id: Number(teacherId) },
      })

      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" })
      }
    }

    const result = await prisma.result.create({
      data: {
        studentId: Number(studentId),
        subjectId: Number(subjectId),
        teacherId: teacherId ? Number(teacherId) : null,
        schoolId: schoolId ? Number(schoolId) : student.schoolId,
        score: Number(score),
        term: term || null,
        session: session || null,
      },
      include: {
        student: true,
        subject: true,
        teacher: true,
        school: true,
      },
    })

    return res.status(201).json(result)
  } catch (error: any) {
    console.error("CREATE RESULT ERROR:", error)
    return res.status(500).json({
      message: "Failed to create result",
      error: error.message,
    })
  }
})

// DELETE RESULT
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid result id" })
    }

    const existingResult = await prisma.result.findUnique({
      where: { id },
    })

    if (!existingResult) {
      return res.status(404).json({ message: "Result not found" })
    }

    await prisma.result.delete({
      where: { id },
    })

    return res.status(200).json({ message: "Result deleted successfully" })
  } catch (error: any) {
    console.error("DELETE RESULT ERROR:", error)
    return res.status(500).json({
      message: "Failed to delete result",
      error: error.message,
    })
  }
})

export default router