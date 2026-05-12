import express from "express"
import { createMeeting } from "../controllers/meeting.controller"
import { authenticate } from "../middlewares/auth.middleware"

const router = express.Router()

router.post("/create", authenticate, createMeeting)

export default router