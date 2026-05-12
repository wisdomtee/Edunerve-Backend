import express from "express"
import {
  getPendingLessonNotes,
  reviewLessonNote,
} from "../controllers/adminLessonNotes.controller"

import { authenticate } from "../middlewares/auth.middleware"

const router = express.Router()

// Admin must be authenticated (you can later add role check)
router.get("/pending", authenticate, getPendingLessonNotes)

router.post("/review", authenticate, reviewLessonNote)

export default router