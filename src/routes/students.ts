import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorizeRoles"
import upload from "../middleware/upload"
import {
  requireSchoolUser,
  enforceSameSchool,
  getSchoolFilter,
} from "../middleware/school"

const router = Router()

function getOrdinal(position: number) {
  const mod10 = position % 10
  const mod100 = position % 100

  if (mod10 === 1 && mod100 !== 11) return `${position}st`
  if (mod10 === 2 && mod100 !== 12) return `${position}nd`
  if (mod10 === 3 && mod100 !== 13) return `${position}rd`
  return `${position}th`
}

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
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
          createdAt: "desc",
        },
      })

      const formattedStudents = students.map((student) => ({
        id: student.id,
        name: student.name,
        gender: student.gender,
        parentId: student.parentId,
        classId: student.classId,
        schoolId: student.schoolId,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
        school: student.school,
        class: student.class,
        parent: student.parent,
        attendance: student.attendance,
        results: student.results,
      }))

      return res.status(200).json(formattedStudents)
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
  "/parents",
  authMiddleware,
  authorizeRoles("SCHOOL_ADMIN", "SUPER_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const parents = await prisma.parent.findMany({
        where:
          req.user?.role === "SUPER_ADMIN"
            ? getSchoolFilter(req)
            : { schoolId: req.user!.schoolId! },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          schoolId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return res.json(parents)
    } catch (error: any) {
      console.error("GET PARENTS ERROR:", error)
      return res.status(500).json({
        message: "Failed to fetch parents",
        error: error.message,
      })
    }
  }
)

router.get(
  "/:id/ranking",
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
          class: true,
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      if (!student.classId) {
        return res.status(200).json({
          studentId: student.id,
          studentName: student.name,
          classId: null,
          className: null,
          averageScore: 0,
          position: null,
          positionText: "—",
          totalStudents: 0,
          ranking: [],
          message: "Student is not assigned to any class",
        })
      }

      const classmates = await prisma.student.findMany({
        where: {
          classId: student.classId,
          schoolId: student.schoolId,
        },
        include: {
          results: true,
        },
      })

      const ranking = classmates
        .map((classmate) => {
          const totalScore = classmate.results.reduce(
            (sum, result) => sum + Number(result.score || 0),
            0
          )

          const averageScore =
            classmate.results.length > 0
              ? totalScore / classmate.results.length
              : 0

          return {
            id: classmate.id,
            name: classmate.name,
            studentId: classmate.id,
            averageScore: Number(averageScore.toFixed(2)),
          }
        })
        .sort((a, b) => {
          if (b.averageScore !== a.averageScore) {
            return b.averageScore - a.averageScore
          }

          return a.name.localeCompare(b.name)
        })

      const position = ranking.findIndex((item) => item.id === student.id) + 1
      const currentStudent = ranking.find((item) => item.id === student.id)

      return res.status(200).json({
        studentId: student.id,
        studentName: student.name,
        classId: student.classId,
        className: student.class?.name || null,
        averageScore: currentStudent?.averageScore || 0,
        position: position || null,
        positionText: position ? getOrdinal(position) : "—",
        totalStudents: ranking.length,
        ranking,
      })
    } catch (error: any) {
      console.error("GET STUDENT RANKING ERROR:", error)
      return res.status(error.message === "Forbidden" ? 403 : 500).json({
        message:
          error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to calculate ranking",
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
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          results: {
            include: {
              subject: true,
              teacher: true,
            },
            orderBy: { createdAt: "desc" },
          },
          attendance: {
            orderBy: { date: "desc" },
          },
        },
      })

      if (!student) {
        return res.status(404).json({ message: "Student not found" })
      }

      enforceSameSchool(req, student.schoolId)

      return res.json({
        id: student.id,
        name: student.name,
        gender: student.gender,
        parentId: student.parentId,
        classId: student.classId,
        schoolId: student.schoolId,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
        school: student.school,
        class: student.class,
        parent: student.parent,
        attendance: student.attendance,
        results: student.results,
      })
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
      const { name, classId, gender } = req.body

      if (!name || !classId) {
        return res.status(400).json({
          message: "name and classId are required",
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
          classId: Number(classId),
          schoolId: req.user!.schoolId!,
          gender: gender || null,
        },
        include: {
          class: {
            select: {
              id: true,
              name: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
  "/assign-parent/:studentId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  requireSchoolUser,
  async (req: AuthRequest, res: Response) => {
    try {
      const studentId = Number(req.params.studentId)
      const { parentId } = req.body

      if (isNaN(studentId) || !parentId) {
        return res.status(400).json({
          message: "Valid studentId and parentId are required",
        })
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      })

      if (!student) {
        return res.status(404).json({
          message: "Student not found",
        })
      }

      enforceSameSchool(req, student.schoolId)

      const parent = await prisma.parent.findUnique({
        where: { id: Number(parentId) },
      })

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found",
        })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        parent.schoolId !== req.user!.schoolId
      ) {
        return res.status(403).json({
          message: "You can only assign parents from your school",
        })
      }

      if (student.schoolId !== parent.schoolId) {
        return res.status(403).json({
          message: "Student and parent must belong to the same school",
        })
      }

      const updatedStudent = await prisma.student.update({
        where: { id: studentId },
        data: {
          parentId: Number(parentId),
        },
        include: {
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      return res.json({
        message: "Parent assigned successfully",
        student: updatedStudent,
      })
    } catch (error: any) {
      console.error("ASSIGN PARENT ERROR:", error)
      return res.status(500).json({
        message: "Failed to assign parent",
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
      const { name, gender, classId, parentId } = req.body

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

      let resolvedClassId = existingStudent.classId
      let resolvedParentId = existingStudent.parentId

      if (classId !== undefined && classId !== null && classId !== "") {
        const classRecord = await prisma.class.findUnique({
          where: { id: Number(classId) },
        })

        if (!classRecord) {
          return res.status(404).json({ message: "Class not found" })
        }

        if (classRecord.schoolId !== req.user!.schoolId) {
          return res.status(403).json({
            message: "You can only assign classes in your school",
          })
        }

        resolvedClassId = Number(classId)
      }

      if (parentId !== undefined) {
        if (parentId === null || parentId === "") {
          resolvedParentId = null
        } else {
          const parent = await prisma.parent.findUnique({
            where: { id: Number(parentId) },
          })

          if (!parent) {
            return res.status(404).json({ message: "Parent not found" })
          }

          if (parent.schoolId !== req.user!.schoolId) {
            return res.status(403).json({
              message: "You can only assign parents in your school",
            })
          }

          resolvedParentId = Number(parentId)
        }
      }

      const student = await prisma.student.update({
        where: { id },
        data: {
          name: name ?? existingStudent.name,
          gender: gender ?? existingStudent.gender,
          classId: resolvedClassId,
          parentId: resolvedParentId,
        },
        include: {
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
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
      return res.status(400).json({
        message: "Photo field is not available in the current Student model",
      })
    } catch (error: any) {
      console.error("UPLOAD PHOTO ERROR:", error)
      return res.status(500).json({
        message: "Failed to upload photo",
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
      return res.status(400).json({
        message: "Remarks fields are not available in the current Student model",
      })
    } catch (error: any) {
      console.error("SAVE REMARKS ERROR:", error)
      return res.status(500).json({
        message: "Failed to save remarks",
        error: error.message,
      })
    }
  }
)

export default router