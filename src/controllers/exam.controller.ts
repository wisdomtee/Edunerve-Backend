import { Response } from "express"
import prisma from "../lib/prisma"
import { AuthRequest } from "../middlewares/auth.middleware"

/* =========================================
   CREATE EXAM + QUESTIONS
========================================= */
export const createExamWithQuestions = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const {
      title,
      subject,
      classId,
      className,
      duration,
      startTime,
      endTime,
      questions,
    } = req.body

    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (!["SCHOOL_ADMIN", "TEACHER"].includes(user.role)) {
      return res.status(403).json({
        message: "Only school administrators and teachers can create exams",
      })
    }

    if (!user.schoolId) {
      return res.status(400).json({
        message: "User is not assigned to a school",
      })
    }

    if (!title || !subject || !classId || !questions?.length) {
      return res.status(400).json({
        message: "Title, subject, class and at least one question are required",
      })
    }

    const numericClassId = Number(classId)

    if (!Number.isInteger(numericClassId)) {
      return res.status(400).json({
        message: "Invalid classId",
      })
    }

    const schoolClass = await prisma.class.findFirst({
      where: {
        id: numericClassId,
        schoolId: user.schoolId,
      },
    })

    if (!schoolClass) {
      return res.status(403).json({
        message: "Class does not belong to your school",
      })
    }

    const normalizedQuestions = questions.map((q: any, index: number) => {
      const answer = String(q.answer || "").trim().toUpperCase()

      if (
        !q.question ||
        !q.optionA ||
        !q.optionB ||
        !q.optionC ||
        !q.optionD
      ) {
        throw new Error(`Question ${index + 1} is incomplete`)
      }

      if (!["A", "B", "C", "D"].includes(answer)) {
        throw new Error(
          `Question ${index + 1} must have answer A, B, C or D`
        )
      }

      return {
        text: String(q.text || q.question),
        question: String(q.question),
        optionA: String(q.optionA),
        optionB: String(q.optionB),
        optionC: String(q.optionC),
        optionD: String(q.optionD),
        answer,
      }
    })

    const exam = await prisma.exam.create({
      data: {
        title: String(title).trim(),
        subject: String(subject).trim(),
        classId: numericClassId,
        className: String(className || schoolClass.name),
        schoolId: user.schoolId,
        createdBy: user.id,
        duration: Number(duration) > 0 ? Number(duration) : 30,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        questions: {
          create: normalizedQuestions,
        },
      },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            optionA: true,
            optionB: true,
            optionC: true,
            optionD: true,
          },
        },
      },
    })

    return res.status(201).json({
      message: "Exam created successfully",
      exam,
    })
  } catch (error: any) {
    console.error("❌ CREATE EXAM ERROR:", error)

    return res.status(500).json({
      message: "Error creating exam",
      error: error.message,
    })
  }
}

/* =========================================
   GET SINGLE EXAM
   IMPORTANT:
   Never return the correct answer to students.
========================================= */
/* =========================================
   GET STUDENT EXAMS
   Returns exams assigned to the student's class.
   Never returns correct answers.
========================================= */
export const getStudentExams = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (user.role !== "STUDENT") {
      return res.status(403).json({
        message: "Only students can access student exams",
      })
    }

    const student = await prisma.student.findUnique({
      where: {
        id: user.id,
      },
    })

    if (!student) {
      return res.status(404).json({
        message: "Student account not found",
      })
    }

    const exams = await prisma.exam.findMany({
      where: {
        schoolId: student.schoolId,
        classId: student.classId,
      },
      select: {
        id: true,
        title: true,
        subject: true,
        classId: true,
        className: true,
        duration: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        _count: {
          select: {
            questions: true,
          },
        },
      },
      orderBy: [
        {
          startTime: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
    })

    const now = new Date()

    const formattedExams = exams.map((exam) => {
      let status = "AVAILABLE"

      if (exam.startTime && now < exam.startTime) {
        status = "UPCOMING"
      } else if (exam.endTime && now > exam.endTime) {
        status = "ENDED"
      }

      return {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        classId: exam.classId,
        className: exam.className,
        duration: exam.duration,
        startTime: exam.startTime,
        endTime: exam.endTime,
        createdAt: exam.createdAt,
        questionCount: exam._count.questions,
        status,
      }
    })

    return res.status(200).json({
      exams: formattedExams,
    })
  } catch (error: any) {
    console.error("GET STUDENT EXAMS ERROR:", error)

    return res.status(500).json({
      message: "Failed to fetch student exams",
    })
  }
}

/* =========================================
   GET ADMIN EXAMS
   Returns exams belonging to the user's school.
   Never returns correct answers.
========================================= */
export const getAdminExams = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    if (
      !["SCHOOL_ADMIN", "TEACHER"].includes(
        user.role
      )
    ) {
      return res.status(403).json({
        message:
          "Only school administrators and teachers can access admin exams",
      })
    }

    if (!user.schoolId) {
      return res.status(400).json({
        message: "User is not assigned to a school",
      })
    }

    const exams = await prisma.exam.findMany({
      where: {
        schoolId: user.schoolId,
      },
      select: {
        id: true,
        title: true,
        subject: true,
        classId: true,
        className: true,
        duration: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
      orderBy: [
        {
          startTime: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
    })

    const now = new Date()

    const formattedExams = exams.map((exam) => {
      let status = "AVAILABLE"

      if (exam.startTime && now < exam.startTime) {
        status = "UPCOMING"
      } else if (exam.endTime && now > exam.endTime) {
        status = "ENDED"
      }

      return {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        classId: exam.classId,
        className: exam.className,
        duration: exam.duration,
        startTime: exam.startTime,
        endTime: exam.endTime,
        createdAt: exam.createdAt,
        questionCount: exam._count.questions,
        attemptCount: exam._count.attempts,
        status,
      }
    })

    return res.status(200).json({
      exams: formattedExams,
    })
  } catch (error: any) {
    console.error("GET ADMIN EXAMS ERROR:", error)

    return res.status(500).json({
      message: "Failed to fetch admin exams",
      error: error.message,
    })
  }
}

export const getExamById = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      })
    }

    const examId = Number(req.params.id)

    if (!Number.isInteger(examId)) {
      return res.status(400).json({
        message: "Invalid exam ID",
      })
    }

    const exam = await prisma.exam.findUnique({
      where: {
        id: examId,
      },
      include: {
        questions: {
          select: {
            id: true,
            question: true,
            optionA: true,
            optionB: true,
            optionC: true,
            optionD: true,
          },
        },
      },
    })

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found",
      })
    }

    /* =========================
       SCHOOL ISOLATION
    ========================= */
    if (user.schoolId !== exam.schoolId) {
      return res.status(403).json({
        message: "You do not have access to this exam",
      })
    }

    /* =========================
       STUDENT ACCESS
    ========================= */
    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: {
          id: user.id,
        },
      })

      if (!student) {
        return res.status(403).json({
          message: "Student account not found",
        })
      }

      if (
        student.schoolId !== exam.schoolId ||
        student.classId !== exam.classId
      ) {
        return res.status(403).json({
          message: "This exam is not assigned to your class",
        })
      }

      const now = new Date()

      if (exam.startTime && now < exam.startTime) {
        return res.status(403).json({
          message: "This exam has not started yet",
        })
      }

      if (exam.endTime && now > exam.endTime) {
        return res.status(403).json({
          message: "This exam has ended",
        })
      }
    }

    const shuffledQuestions = [...exam.questions].sort(
      () => Math.random() - 0.5
    )

    return res.status(200).json({
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        classId: exam.classId,
        className: exam.className,
        schoolId: exam.schoolId,
        duration: exam.duration,
        startTime: exam.startTime,
        endTime: exam.endTime,
        createdAt: exam.createdAt,
        questions: shuffledQuestions,
      },
    })
  } catch (error: any) {
    console.error("❌ GET EXAM ERROR:", error)

    return res.status(500).json({
      message: error.message,
    })
  }
}
