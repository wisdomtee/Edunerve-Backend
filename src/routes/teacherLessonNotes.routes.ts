import express from "express"
import { createLessonNote } from "../controllers/teacherLessonNotes.controller"
import { authenticate } from "../middlewares/auth.middleware"

const router = express.Router()

router.post("/create", authenticate, createLessonNote)

export default router