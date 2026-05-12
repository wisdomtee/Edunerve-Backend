import express from "express"

import {
  createExamWithQuestions,
  getExamById,
} from "../controllers/exam.controller"

import {
  submitExamAttempt,
  startExamAttempt,
  reportCheatingEvent,
} from "../controllers/examAttempt.controller"

const router = express.Router()

/* ================= TEST ================= */
router.get("/test", (_req, res) => {
  res.json({
    message: "CBT route working 🚀",
  })
})

/* ================= EXAM ================= */
router.post("/exam", createExamWithQuestions)
router.get("/exam/:id", getExamById)

/* ================= CBT FLOW ================= */
router.post("/exam/start", startExamAttempt)
router.post("/exam/submit", submitExamAttempt)

/* ================= ANTI-CHEAT ================= */
router.post("/exam/cheat", reportCheatingEvent)

export default router