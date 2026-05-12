import express from "express"

import {
  registerStudent,
  loginStudent,
} from "../controllers/studentAuthController"

const router = express.Router()

router.post("/register", registerStudent)
router.post("/login", loginStudent)

export default router