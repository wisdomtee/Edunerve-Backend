import express from "express"

import {
  createStudent,
  getStudents,
} from "../controllers/studentController"

import { authenticate } from "../middlewares/auth.middleware"

const router = express.Router()

router.post("/", authenticate, createStudent)
router.get("/", authenticate, getStudents)

export default router
