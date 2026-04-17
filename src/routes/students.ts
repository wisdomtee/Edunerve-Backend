import { Router, Response } from "express"
import prisma from "../prisma"
import { authMiddleware, AuthRequest } from "../middleware/auth"
import { authorizeRoles } from "../middleware/authorize"
import { requireActiveSubscription } from "../middleware/subscription"
import upload from "../middleware/upload"
import { enforceSameSchool } from "../middleware/school"

const router = Router()

function getOrdinal(position: number) {
  const mod10 = position % 10
  const mod100 = position % 100

  if (mod10 === 1 && mod100 !== 11) return `${position}st`
  if (mod10 === 2 && mod100 !== 12) return `${position}nd`
  if (mod10 === 3 && mod100 !== 13) return `${position}rd`
  return `${position}th`
}

async function getTeacherProfile(req: AuthRequest) {
  if (!req.user || req.user.role !== "TEACHER") return null

  const teacher = await prisma.teacher.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      schoolId: true,
    },
  })

  return teacher
}

async function getParentProfile(req: AuthRequest) {
  if (!req.user || req.user.role !== "PARENT") return null

  const parent = await prisma.parent.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      schoolId: true,
    },
  })

  return parent
}

async function getStudentWhereClause(req: AuthRequest) {
  if (!req.user) {
    throw new Error("Unauthorized")
  }

  if (req.user.role === "SUPER_ADMIN") {
    return {}
  }

  if (req.user.role === "TEACHER") {
    const teacher = await getTeacherProfile(req)

    if (!teacher) {
      return {
        id: -1,
      }
    }

    return {
      schoolId: teacher.schoolId,
      class: {
        teacherId: teacher.id,
      },
    }
  }

  if (req.user.role === "PARENT") {
    const parent = await getParentProfile(req)

    if (!parent) {
      return {
        id: -1,
      }
    }

    return {
      schoolId: parent.schoolId,
      parentId: parent.id,
    }
  }

  if (req.user.schoolId === null || req.user.schoolId === undefined) {
    throw new Error("Forbidden")
  }

  return {
    schoolId: req.user.schoolId,
  }
}

router.get(
  "/",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"),
  async (req: AuthRequest, res: Response) => {
    try {
      const where = await getStudentWhereClause(req)

      const students = await prisma.student.findMany({
        where,
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
              teacherId: true,
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
        studentId: student.studentId,
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
      return res.status(
        error.message === "Unauthorized"
          ? 401
          : error.message === "Forbidden"
          ? 403
          : 500
      ).json({
        message:
          error.message === "Unauthorized"
            ? "Unauthorized"
            : error.message === "Forbidden"
            ? "Forbidden"
            : "Failed to fetch students",
        error: error.message,
      })
    }
  }
)

router.get(
  "/parents",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        })
      }

      let where: any = {}

      if (req.user.role === "SUPER_ADMIN") {
        where = {}
      } else {
        if (req.user.schoolId === null || req.user.schoolId === undefined) {
          return res.status(403).json({
            message: "Forbidden",
          })
        }

        where = {
          schoolId: req.user.schoolId,
        }
      }

      const parents = await prisma.parent.findMany({
        where,
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

      return res.status(200).json(parents)
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

      if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherProfile(req)

        if (!teacher || student.class?.teacherId !== teacher.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      if (req.user?.role === "PARENT") {
        const parent = await getParentProfile(req)

        if (!parent || student.parentId !== parent.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

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
            studentId: classmate.studentId,
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
              teacherId: true,
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

      if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherProfile(req)

        if (!teacher || student.class?.teacherId !== teacher.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      if (req.user?.role === "PARENT") {
        const parent = await getParentProfile(req)

        if (!parent || student.parentId !== parent.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

      return res.status(200).json({
        id: student.id,
        name: student.name,
        studentId: student.studentId,
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
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, classId, parentId, studentId } = req.body

      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized",
        })
      }

      if (!name || !classId) {
        return res.status(400).json({
          message: "name and classId are required",
        })
      }

      const parsedClassId = Number(classId)
      if (isNaN(parsedClassId)) {
        return res.status(400).json({
          message: "Valid classId is required",
        })
      }

      const classRecord = await prisma.class.findUnique({
        where: { id: parsedClassId },
      })

      if (!classRecord) {
        return res.status(404).json({
          message: "Class not found",
        })
      }

      let targetSchoolId: number

      if (req.user.role === "SUPER_ADMIN") {
        targetSchoolId = classRecord.schoolId
      } else {
        if (req.user.schoolId === null || req.user.schoolId === undefined) {
          return res.status(403).json({
            message: "No school assigned to this user",
          })
        }

        if (classRecord.schoolId !== req.user.schoolId) {
          return res.status(403).json({
            message: "You can only add students to classes in your school",
          })
        }

        targetSchoolId = req.user.schoolId
      }

      let resolvedParentId: number | null = null

      if (parentId !== undefined && parentId !== null && parentId !== "") {
        const parsedParentId = Number(parentId)

        if (isNaN(parsedParentId)) {
          return res.status(400).json({
            message: "Valid parentId is required",
          })
        }

        const parent = await prisma.parent.findUnique({
          where: { id: parsedParentId },
        })

        if (!parent) {
          return res.status(404).json({
            message: "Parent not found",
          })
        }

        if (parent.schoolId !== targetSchoolId) {
          return res.status(403).json({
            message: "Student and parent must belong to the same school",
          })
        }

        resolvedParentId = parsedParentId
      }

      const generatedStudentId =
        typeof studentId === "string" && studentId.trim().length > 0
          ? studentId.trim()
          : `STU-${Date.now()}`

      const existingStudent = await prisma.student.findUnique({
        where: { studentId: generatedStudentId },
      })

      if (existingStudent) {
        return res.status(409).json({
          message: "Student ID already exists",
        })
      }

      const student = await prisma.student.create({
        data: {
          name: String(name).trim(),
          studentId: generatedStudentId,
          class: {
            connect: { id: parsedClassId },
          },
          school: {
            connect: { id: targetSchoolId },
          },
          ...(resolvedParentId !== null
            ? {
                parent: {
                  connect: { id: resolvedParentId },
                },
              }
            : {}),
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
          userId: req.user.id,
        },
      })

      return res.status(201).json(student)
    } catch (error: any) {
      console.error("CREATE STUDENT ERROR:", error)
      return res.status(500).json({
        message: error?.message || "Failed to create student",
        error: error?.message,
      })
    }
  }
)

router.put(
  "/assign-parent/:studentId",
  authMiddleware,
  authorizeRoles("SUPER_ADMIN", "SCHOOL_ADMIN"),
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

      const parsedParentId = Number(parentId)

      const parent = await prisma.parent.findUnique({
        where: { id: parsedParentId },
      })

      if (!parent) {
        return res.status(404).json({
          message: "Parent not found",
        })
      }

      if (
        req.user?.role === "SCHOOL_ADMIN" &&
        parent.schoolId !== req.user.schoolId
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
          parent: {
            connect: { id: parsedParentId },
          },
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

      return res.status(200).json({
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
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id)
      const { name, classId, parentId } = req.body

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

      const updateData: any = {
        name: name ? String(name).trim() : existingStudent.name,
      }

      if (classId !== undefined) {
        if (classId === null || classId === "") {
          updateData.class = {
            disconnect: true,
          }
        } else {
          const parsedClassId = Number(classId)

          const classRecord = await prisma.class.findUnique({
            where: { id: parsedClassId },
          })

          if (!classRecord) {
            return res.status(404).json({ message: "Class not found" })
          }

          if (classRecord.schoolId !== req.user!.schoolId) {
            return res.status(403).json({
              message: "You can only assign classes in your school",
            })
          }

          updateData.class = {
            connect: { id: parsedClassId },
          }
        }
      }

      if (parentId !== undefined) {
        if (parentId === null || parentId === "") {
          updateData.parent = {
            disconnect: true,
          }
        } else {
          const parsedParentId = Number(parentId)

          const parent = await prisma.parent.findUnique({
            where: { id: parsedParentId },
          })

          if (!parent) {
            return res.status(404).json({ message: "Parent not found" })
          }

          if (parent.schoolId !== req.user!.schoolId) {
            return res.status(403).json({
              message: "You can only assign parents in your school",
            })
          }

          updateData.parent = {
            connect: { id: parsedParentId },
          }
        }
      }

      const student = await prisma.student.update({
        where: { id },
        data: updateData,
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

      return res.status(200).json(student)
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
  requireActiveSubscription,
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

      return res.status(200).json({ message: "Student deleted successfully" })
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
  requireActiveSubscription,
  upload.single("photo"),
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

      if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherProfile(req)

        if (!teacher || student.class?.teacherId !== teacher.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

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
  requireActiveSubscription,
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

      if (req.user?.role === "TEACHER") {
        const teacher = await getTeacherProfile(req)

        if (!teacher || student.class?.teacherId !== teacher.id) {
          return res.status(403).json({ message: "Forbidden" })
        }
      }

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