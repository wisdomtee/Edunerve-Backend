import { Router } from "express"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

// GET ALL STUDENTS
router.get("/", authMiddleware, async (_req, res) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        school: true,
        class: true,
        results: true,
        attendance: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return res.status(200).json({ students })
  } catch (error: any) {
    console.error("GET STUDENTS ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch students",
      error: error.message,
    })
  }
})

// CREATE STUDENT
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name, studentId, classId, schoolId, photo } = req.body

    if (!name || !studentId || !classId || !schoolId) {
      return res.status(400).json({
        message: "name, studentId, classId and schoolId are required",
      })
    }

    const existingStudent = await prisma.student.findFirst({
      where: {
        studentId,
      },
    })

    if (existingStudent) {
      return res.status(400).json({
        message: "A student with this studentId already exists",
      })
    }

    const existingClass = await prisma.class.findUnique({
      where: { id: Number(classId) },
    })

    if (!existingClass) {
      return res.status(404).json({
        message: "Class not found",
      })
    }

    const existingSchool = await prisma.school.findUnique({
      where: { id: Number(schoolId) },
    })

    if (!existingSchool) {
      return res.status(404).json({
        message: "School not found",
      })
    }

    const student = await prisma.student.create({
      data: {
        name,
        studentId,
        classId: Number(classId),
        schoolId: Number(schoolId),
        photo: photo || null,
      },
      include: {
        school: true,
        class: true,
      },
    })

    return res.status(201).json(student)
  } catch (error: any) {
    console.error("CREATE STUDENT ERROR:", error)
    return res.status(500).json({
      message: "Failed to create student",
      error: error.message,
    })
  }
})

// GET ONE STUDENT
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid student id" })
    }

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        school: true,
        class: true,
        results: {
          include: {
            subject: true,
            teacher: true,
            school: true,
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
    })

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    return res.status(200).json(student)
  } catch (error: any) {
    console.error("GET STUDENT ERROR:", error)
    return res.status(500).json({
      message: "Failed to fetch student",
      error: error.message,
    })
  }
})

export default router