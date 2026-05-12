import express from "express"
import {
  startExamAttempt,
  submitExamAttempt,
} from "../controllers/examAttempt.controller"

const router = express.Router()

router.post("/start", startExamAttempt)
router.post("/submit", submitExamAttempt)

export default router