import express from "express"

import {
  createClass,
  getClasses,
} from "../controllers/classController"

const router = express.Router()

router.post("/", createClass)
router.get("/", getClasses)

export default router