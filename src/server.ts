import express, {
  NextFunction,
  Request,
  Response,
} from "express"

import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import http from "http"
import { Server } from "socket.io"
import cron from "node-cron"

/* =========================
   JOBS
========================= */
import { checkExpiredSubscriptions } from "./jobs/subscriptionExpiry"
import { startExamAutoSubmit } from "./jobs/examAutoSubmit"

/* =========================
   EXAM SESSION
========================= */
import {
  startExam,
  closeExam,
} from "./routes/examSession"

/* =========================
   AUTH
========================= */
import authRouter from "./routes/auth"
import userRoutes from "./routes/users"
import appVersionRouter from "./routes/appVersion"
import studentAuthRoutes from "./routes/studentAuthRoutes"

/* =========================
   SCHOOL CORE
========================= */
import schoolsRouter from "./routes/schools"
import studentsRouter from "./routes/students"
import studentRoutes from "./routes/studentRoutes"
import teachersRouter from "./routes/teachers"
import classesRouter from "./routes/classes"
import classRoutes from "./routes/classRoutes"
import subjectRoutes from "./routes/subject"
import schoolOnboardingRoutes from "./routes/schoolOnboarding"

/* =========================
   ACADEMICS
========================= */
import attendanceRouter from "./routes/attendance"
import resultsRouter from "./routes/results"
import reportRouter from "./routes/report"

import examRoutes from "./routes/exam.routes"
import examAttemptRoutes from "./routes/examAttempt.routes"

import {
  startExamControl,
  stopExamControl,
  getExamStatus,
} from "./routes/examControl"

import {
  getQuestions,
  createQuestion,
} from "./routes/question"

/* =========================
   DASHBOARD
========================= */
import dashboardRouter from "./routes/dashboard"
import analyticsRoutes from "./routes/analytics"
import teacherDashboardRoutes from "./routes/teacherDashboard"
import parentPortalRoutes from "./routes/parentPortal"
import parentRoutes from "./routes/parent"

/* =========================
   COMMUNICATION
========================= */
import notificationRoutes from "./routes/notifications"
import messageRoutes from "./routes/messages"

/* =========================
   LESSON NOTES
========================= */
import teacherLessonNotesRoutes from "./routes/teacherLessonNotes.routes"
import adminLessonNotesRoutes from "./routes/adminLessonNotes.routes"

/* =========================
   MEETINGS
========================= */
import meetingRoutes from "./routes/meeting.routes"
import zoomRoutes from "./routes/zoom"
import cbtRoutes from "./routes/cbt"

/* =========================
   FEES / PAYMENTS
========================= */
import feesRouter from "./routes/fees"
import invoiceRoutes from "./routes/invoices"
import feeInvoicesRouter from "./routes/feeInvoices"
import feePaymentsRoutes from "./routes/feePayments"
import feePaymentVerificationRoutes from "./routes/feePaymentVerification"
import subscriptionsRoutes from "./routes/subscriptions"
import paymentRoutes from "./routes/payments"
import billingRouter from "./routes/billing"
import webhookRoutes from "./routes/webhook"
import paystackRoutes from "./routes/paystack"

/* =========================
   ADMIN
========================= */
import adminRoutes from "./routes/admin"

/* =========================
   INIT
========================= */
dotenv.config()

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
})

const PORT = Number(process.env.PORT) || 5000

/* =========================
   CORS
========================= */
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true

  if (allowedOrigins.includes(origin)) {
    return true
  }

  if (origin.endsWith(".vercel.app")) {
    return true
  }

  return /^http:\/\/localhost:\d+$/.test(origin)
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true)
      }

      return callback(new Error("Not allowed by CORS"))
    },

    credentials: true,
  })
)

/* =========================
   SOCKET.IO
========================= */
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id)

  socket.on("join-user", (id) => {
    socket.join(`user:${id}`)
  })

  socket.on("join-school", (id) => {
    socket.join(`school:${id}`)
  })

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id)
  })
})

/* =========================
   BODY PARSER
========================= */
app.use(express.json({ limit: "10mb" }))
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
)

/* =========================
   STATIC FILES
========================= */
app.use(
  "/uploads",
  express.static(
    path.join(process.cwd(), "uploads")
  )
)

/* =========================
   WEBHOOKS
========================= */
app.use(
  "/api/paystack/webhook",
  express.raw({
    type: "application/json",
  })
)

app.use("/webhook", webhookRoutes)

/* =========================
   BASE ROUTE
========================= */
app.get("/", (_req, res) => {
  res.send("EduCore API Running 🚀")
})

/* =========================
   AUTH ROUTES
========================= */
app.use("/auth", authRouter)
app.use("/users", userRoutes)
app.use("/student-auth", studentAuthRoutes)

/* =========================
   SCHOOL ROUTES
========================= */
app.use("/schools", schoolsRouter)

app.use("/students", studentsRouter)
app.use("/students", studentRoutes)

app.use("/teachers", teachersRouter)

app.use("/classes", classesRouter)
app.use("/classes", classRoutes)

app.use("/subjects", subjectRoutes)

app.use(
  "/school-onboarding",
  schoolOnboardingRoutes
)

/* =========================
   ACADEMICS
========================= */
app.use("/attendance", attendanceRouter)
app.use("/results", resultsRouter)
app.use("/report", reportRouter)

app.use("/api/exams", examRoutes)
app.use("/api/exam-attempt", examAttemptRoutes)

app.get("/questions", getQuestions)
app.post("/questions", createQuestion)

/* =========================
   EXAM CONTROL
========================= */
app.post("/exam/start", startExam)
app.post("/exam/close", closeExam)

app.post(
  "/exam/control/start",
  startExamControl
)

app.post(
  "/exam/control/stop",
  stopExamControl
)

app.get(
  "/exam/control/status",
  getExamStatus
)

/* =========================
   DASHBOARD
========================= */
app.use("/dashboard", dashboardRouter)
app.use("/analytics", analyticsRoutes)
app.use("/teacher", teacherDashboardRoutes)

app.use(
  "/parent-portal",
  parentPortalRoutes
)

app.use("/parents", parentRoutes)

/* =========================
   COMMUNICATION
========================= */
app.use("/notifications", notificationRoutes)
app.use("/messages", messageRoutes(io))

/* =========================
   LESSON NOTES
========================= */
app.use(
  "/teacher/lesson-notes",
  teacherLessonNotesRoutes
)

app.use(
  "/admin/lesson-notes",
  adminLessonNotesRoutes
)

/* =========================
   MEETINGS / CBT
========================= */
app.use("/meetings", meetingRoutes)
app.use("/api/zoom", zoomRoutes)
app.use("/api/cbt", cbtRoutes)

/* =========================
   FEES / PAYMENTS
========================= */
app.use("/fees", feesRouter)
app.use("/invoices", invoiceRoutes)
app.use("/fee-invoices", feeInvoicesRouter)

app.use("/api/fees", feePaymentsRoutes)

app.use("/payments", paymentRoutes)
app.use("/billing", billingRouter)

app.use(
  "/subscriptions",
  subscriptionsRoutes
)

app.use(
  "/api/paystack",
  feePaymentVerificationRoutes
)

app.use("/api/paystack", paystackRoutes)

/* =========================
   ADMIN
========================= */
app.use("/admin", adminRoutes)
app.use("/app-version", appVersionRouter)

/* =========================
   CRON JOBS
========================= */

// subscription expiry checker
cron.schedule("0 0 * * *", async () => {
  console.log(
    "⏰ Running subscription expiry check..."
  )

  try {
    await checkExpiredSubscriptions()

    console.log(
      "✅ Subscription expiry check completed"
    )
  } catch (err) {
    console.error(
      "❌ Subscription expiry cron failed:",
      err
    )
  }
})

// exam auto-submit checker
cron.schedule("* * * * *", async () => {
  try {
    await startExamAutoSubmit()
  } catch (err) {
    console.error(
      "❌ Exam auto-submit cron failed:",
      err
    )
  }
})

/* =========================
   404
========================= */
app.use((_req, res) => {
  res.status(404).json({
    message: "Route not found",
  })
})

/* =========================
   GLOBAL ERROR HANDLER
========================= */
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("🔥 SERVER ERROR:", err)

    res.status(500).json({
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development"
          ? err.message
          : undefined,
    })
  }
)

/* =========================
   START SERVER
========================= */
server.listen(PORT, () => {
  console.log(
    `🚀 Server running on port ${PORT}`
  )

  console.log(
    "✅ Allowed origins:",
    allowedOrigins
  )
})