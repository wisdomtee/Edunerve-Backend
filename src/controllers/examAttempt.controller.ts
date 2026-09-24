import { Response } from "express"
import prisma from "../lib/prisma"
import { AuthRequest } from "../middlewares/auth.middleware"

/* =========================
   START EXAM
========================= */
export const startExamAttempt = async (
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
        message: "Only students can start an exam",
      })
    }

    const { examId } = req.body

    const numericExamId = Number(examId)

    if (!Number.isInteger(numericExamId)) {
      return res.status(400).json({
        message: "Invalid exam ID",
      })
    }

    const student = await prisma.student.findUnique({
      where: {
        id: user.id,
      },
    })

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      })
    }

    const exam = await prisma.exam.findUnique({
      where: {
        id: numericExamId,
      },
    })

    if (!exam) {
      return res.status(404).json({
        message: "Exam not found",
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

    const existing = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: numericExamId,
          studentId: user.id,
        },
      },
    })

    if (existing) {
      if (existing.status === "COMPLETED") {
        return res.status(400).json({
          message: "You have already submitted this exam",
          attempt: existing,
        })
      }

      const attemptEndTime = new Date(
        existing.startedAt.getTime() + exam.duration * 60 * 1000
      )

      return res.json({
        message: "Exam already started",
        attempt: existing,
        startTime: existing.startedAt,
        endTime: attemptEndTime,
        duration: exam.duration,
      })
    }

    const startedAt = now

    const endTime = new Date(
      startedAt.getTime() + exam.duration * 60 * 1000
    )

    const attempt = await prisma.examAttempt.create({
      data: {
        examId: numericExamId,
        studentId: user.id,
        startedAt,
        status: "IN_PROGRESS",
      },
    })

    return res.status(201).json({
      message: "Exam started",
      attempt,
      startTime: startedAt,
      endTime,
      duration: exam.duration,
    })
  } catch (error: any) {
    console.error("❌ START EXAM ERROR:", error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

/* =========================
   CHEATING REPORT SYSTEM
========================= */
export const reportCheatingEvent = async (
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
        message: "Only students can report exam events",
      })
    }

    const { examId, type } = req.body

    const allowedTypes = [
      "TAB_SWITCH",
      "COPY",
      "PASTE",
      "FULLSCREEN_EXIT",
    ]

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        message: "Invalid cheating event type",
      })
    }

    const attempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: Number(examId),
          studentId: user.id,
        },
      },
    })

    if (!attempt) {
      return res.status(404).json({
        message: "Attempt not found",
      })
    }

    if (attempt.status === "COMPLETED") {
      return res.status(400).json({
        message: "Exam already submitted",
      })
    }

    const update: Record<string, number> = {}

    if (type === "TAB_SWITCH") {
      update.tabSwitchCount = attempt.tabSwitchCount + 1
      update.penalty = attempt.penalty + 2
    }

    if (type === "COPY") {
      update.copyCount = attempt.copyCount + 1
      update.penalty = attempt.penalty + 1
    }

    if (type === "PASTE") {
      update.pasteCount = attempt.pasteCount + 1
      update.penalty = attempt.penalty + 1
    }

    if (type === "FULLSCREEN_EXIT") {
      update.fullscreenExit = attempt.fullscreenExit + 1
      update.penalty = attempt.penalty + 3
    }

    const updated = await prisma.examAttempt.update({
      where: {
        id: attempt.id,
      },
      data: update,
    })

    return res.json({
      message: "Exam event recorded",
      attempt: updated,
    })
  } catch (error: any) {
    console.error("❌ CHEAT EVENT ERROR:", error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

/* =========================
   SUBMIT EXAM
========================= */
export const submitExamAttempt = async (
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
        message: "Only students can submit exams",
      })
    }

    const { examId, answers } = req.body

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        message: "Answers must be an array",
      })
    }

    const attempt = await prisma.examAttempt.findUnique({
      where: {
        examId_studentId: {
          examId: Number(examId),
          studentId: user.id,
        },
      },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
      },
    })

    if (!attempt) {
      return res.status(404).json({
        message: "Exam attempt not found",
      })
    }

    if (attempt.status === "COMPLETED") {
      return res.status(400).json({
        message: "Exam already submitted",
      })
    }

    const deadline = new Date(
      attempt.startedAt.getTime() +
        attempt.exam.duration * 60 * 1000
    )

    const now = new Date()

    const wasLate = now > deadline

    let score = 0

    for (const question of attempt.exam.questions) {
      const submittedAnswer = answers.find(
        (answer: any) =>
          Number(answer.questionId) === question.id
      )

      if (
        submittedAnswer &&
        String(submittedAnswer.answer).trim().toUpperCase() ===
          question.answer.trim().toUpperCase()
      ) {
        score++
      }
    }

    /*
      Existing penalty system:
      TAB_SWITCH       = 2 penalty points
      COPY             = 1
      PASTE            = 1
      FULLSCREEN_EXIT  = 3

      We keep the existing behaviour but round the
      final score because ExamAttempt.score is an Int.
    */
    const penaltyFactor = attempt.penalty * 0.5

    const finalScore = Math.max(
      0,
      Math.round(score - penaltyFactor)
    )

    const total = attempt.exam.questions.length

    const percentage =
      total === 0
        ? 0
        : Number(((finalScore / total) * 100).toFixed(2))

    const updated = await prisma.examAttempt.update({
      where: {
        id: attempt.id,
      },
      data: {
        score: finalScore,
        total,
        percentage,
        status: "COMPLETED",
        submittedAt: now,
        answers,
      },
    })

    return res.json({
      message: wasLate
        ? "Exam submitted after the allowed time"
        : "Exam submitted successfully",
      result: {
        id: updated.id,
        examId: updated.examId,
        studentId: updated.studentId,
        score: updated.score,
        total: updated.total,
        percentage: updated.percentage,
        penalty: updated.penalty,
        tabSwitchCount: updated.tabSwitchCount,
        copyCount: updated.copyCount,
        pasteCount: updated.pasteCount,
        fullscreenExit: updated.fullscreenExit,
        status: updated.status,
        startedAt: updated.startedAt,
        submittedAt: updated.submittedAt,
        wasLate,
      },
    })
  } catch (error: any) {
    console.error("❌ SUBMIT EXAM ERROR:", error)

    return res.status(500).json({
      message: error.message,
    })
  }
}
