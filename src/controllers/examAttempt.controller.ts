import { Request, Response } from "express"
import prisma from "../prisma"

/* =========================
   START EXAM
========================= */
export const startExamAttempt = async (req: Request, res: Response) => {
  try {
    const { examId, studentId } = req.body

    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) },
    })

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" })
    }

    const existing = await prisma.examAttempt.findFirst({
      where: {
        examId: Number(examId),
        studentId: Number(studentId),
      },
    })

    if (existing) {
      return res.json({
        message: "Already started",
        attempt: existing,
      })
    }

    const now = new Date()
    const duration = exam.duration ?? 30
    const endTime = new Date(now.getTime() + duration * 60000)

    const attempt = await prisma.examAttempt.create({
      data: {
        examId: Number(examId),
        studentId: Number(studentId),
        startedAt: now,
        status: "IN_PROGRESS",
      },
    })

    return res.status(201).json({
      message: "Exam started",
      attempt,
      startTime: now,
      endTime,
      duration,
    })
  } catch (error: any) {
    return res.status(500).json({ message: error.message })
  }
}

/* =========================
   CHEATING REPORT SYSTEM
========================= */
export const reportCheatingEvent = async (req: Request, res: Response) => {
  try {
    const { examId, studentId, type } = req.body

    const attempt = await prisma.examAttempt.findFirst({
      where: {
        examId: Number(examId),
        studentId: Number(studentId),
      },
    })

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" })
    }

    let update: any = {}

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
      where: { id: attempt.id },
      data: update,
    })

    return res.json({
      message: "Cheating event recorded",
      attempt: updated,
    })
  } catch (error: any) {
    return res.status(500).json({ message: error.message })
  }
}

/* =========================
   SUBMIT EXAM
========================= */
export const submitExamAttempt = async (req: Request, res: Response) => {
  try {
    const { examId, studentId, answers } = req.body

    const attempt = await prisma.examAttempt.findFirst({
      where: {
        examId: Number(examId),
        studentId: Number(studentId),
      },
      include: {
        exam: { include: { questions: true } },
      },
    })

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" })
    }

    if (attempt.status === "COMPLETED") {
      return res.status(400).json({ message: "Already submitted" })
    }

    let score = 0
    const total = attempt.exam.questions.length

    attempt.exam.questions.forEach((q) => {
      const ans = answers.find((a: any) => a.questionId === q.id)
      if (ans && ans.answer === q.answer) score++
    })

    const penaltyFactor = attempt.penalty * 0.5
    const finalScore = Math.max(0, score - penaltyFactor)

    const percentage =
      total === 0 ? 0 : (finalScore / total) * 100

    const updated = await prisma.examAttempt.update({
      where: { id: attempt.id },
      data: {
        score: finalScore,
        total,
        percentage,
        status: "COMPLETED",
        submittedAt: new Date(),
        answers,
      },
    })

    return res.json({
      message: "Exam submitted successfully",
      result: updated,
    })
  } catch (error: any) {
    return res.status(500).json({ message: error.message })
  }
}