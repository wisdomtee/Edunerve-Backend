import express from "express"

import {
  createExamWithQuestions,
  getAdminExams,
  getExamById,
  getStudentExams,
} from "../controllers/exam.controller"

import {
  submitExamAttempt,
  startExamAttempt,
  reportCheatingEvent,
} from "../controllers/examAttempt.controller"

import { authenticate } from "../middlewares/auth.middleware"

const router = express.Router()

/* =========================
   TEST
========================= */
router.get("/test", (_req, res) => {
  res.json({
    message: "CBT route working 🚀",
  })
})

/*
  Everything below requires a valid JWT.
*/
router.use(authenticate)

/* =========================
   ADMIN EXAMS
========================= */

router.get(
  "/admin",
  getAdminExams
)

/* =========================
   STUDENT EXAMS
========================= */

router.get(
  "/student",
  getStudentExams
)

/* =========================
   EXAM
========================= */

router.post(
  "/exam",
  createExamWithQuestions
)

router.get(
  "/exam/:id",
  getExamById
)

/* =========================
   CBT FLOW
========================= */

router.post(
  "/exam/start",
  startExamAttempt
)

router.post(
  "/exam/submit",
  submitExamAttempt
)

/* =========================
   ANTI-CHEAT
========================= */

router.post(
  "/exam/cheat",
  reportCheatingEvent
)

export default router
