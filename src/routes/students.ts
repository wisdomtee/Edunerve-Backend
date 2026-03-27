import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import upload from "../middleware/upload"
import {
  requireSchoolUser,
  enforceSameSchool,
  getSchoolFilter,
} from "../middleware/school"

const router = Router()

router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const students = await prisma.student.findMany({
        where: getSchoolFilter(req),
        include: {
          school: true,
          class: true,
          results: true,
          attendances: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.status(200).json(students)
    } catch (error: any) {
      console.error("GET STUDENTS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch students",
        error: error.message,
      })
    }
  }
)

router.get(
  "/:id",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
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
            },
            orderBy: { createdAt: "desc" },
          },
          attendances: {
            orderBy: { date: "desc" },
          },
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      return res.json(student)
    } catch (error: any) {
      console.error("GET STUDENT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to fetch student",
        error: error.message,
      })
    }
  }
)

router.post(
  "/create",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, studentId, classId, gender } = req.body

      if (!name || !studentId || !classId) {
        return res.status(400).json({
          message: "name, studentId and classId are required",
        })
      }

      const existingStudent = await prisma.student.findFirst({
        where: { studentId },
      })

      if (existingStudent) {
        return res.status(400).json({
          message: "StudentId already exists",
        })
      }

      const classRecord = await prisma.class.findUnique({
        where: { id: Number(classId) },
      })

      if (!classRecord) {
        return res.status(404).json({
          message: "Class not found",
        })
      }

      if (classRecord.schoolId !== req.user!.schoolId!) {
        return res.status(403).json({
          message: "You can only add students to classes in your school",
        })
      }

      const student = await prisma.student.create({
        data: {
          name,
          studentId,
          classId: Number(classId),
          schoolId: req.user!.schoolId!,
          gender: gender || null,
        },
        include: {
          class: true,
          school: true,
        },
      })

      await prisma.notification.create({
        data: {
          title: "New Student Registered",
          message: `${student.name} has been added successfully to ${
            student.class?.name || "a class"
          }.`,
          userId: req.user!.id,
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
  }
)

router.put(
  "/:id",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, studentId, gender } = req.body

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" })
      }

      const existingStudent = await prisma.student.findUnique({
        where: { id },
      })

      if (!existingStudent) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, existingStudent.schoolId)

      const student = await prisma.student.update({
        where: { id },
        data: {
          name: name ?? existingStudent.name,
          studentId: studentId ?? existingStudent.studentId,
          gender: gender ?? existingStudent.gender,
        },
      })

      return res.json(student)
    } catch (error: any) {
      console.error("UPDATE STUDENT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to update student",
        error: error.message,
      })
    }
  }
)

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" })
      }

      const student = await prisma.student.findUnique({
        where: { id },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      await prisma.student.delete({
        where: { id },
      })

      return res.json({ message: "Student deleted successfully" })
    } catch (error: any) {
      console.error("DELETE STUDENT ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to delete student",
        error: error.message,
      })
    }
  }
)

router.post(
  "/:id/photo",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireSchoolUser,
  upload.single("photo"),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" })
      }

      const student = await prisma.student.findUnique({
        where: { id },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      const updated = await prisma.student.update({
        where: { id },
        data: {
          photo: req.file.path,
        },
      })

      return res.json(updated)
    } catch (error: any) {
      console.error("UPLOAD PHOTO ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to upload photo",
        error: error.message,
      })
    }
  }
)

router.put(
  "/:id/remarks",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "TEACHER"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { teacherRemark, principalRemark } = req.body

      const student = await prisma.student.findUnique({
        where: { id },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      const updated = await prisma.student.update({
        where: { id },
        data: {
          teacherRemark,
          principalRemark,
        },
      })

      return res.json(updated)
    } catch (error: any) {
      console.error("SAVE REMARKS ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to save remarks",
        error: error.message,
      })
    }
  }
)

export default router