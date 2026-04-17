import express, { NextFunction, Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import http from "http"
import { Server } from "socket.io"
import cron from "node-cron"

/* ===== ROUTES ===== */
import authRouter from "./routes/auth"
import userRoutes from "./routes/users"

import schoolsRouter from "./routes/schools"
import studentsRouter from "./routes/students"
import teachersRouter from "./routes/teachers"
import classesRouter from "./routes/classes"
import subjectRoutes from "./routes/subject"

import attendanceRouter from "./routes/attendance"
import resultsRouter from "./routes/results"
import reportRouter from "./routes/report"

import dashboardRouter from "./routes/dashboard"
import analyticsRoutes from "./routes/analytics"

import notificationRoutes from "./routes/notifications"
import createMessageRoutes from "./routes/messages"

import teacherDashboardRoutes from "./routes/teacherDashboard"
import parentPortalRoutes from "./routes/parentPortal"
import parentRoutes from "./routes/parent"

import feesRouter from "./routes/fees"
import invoiceRoutes from "./routes/invoices"
import feeInvoicesRouter from "./routes/feeInvoices"
import feePaymentVerificationRoutes from "./routes/feePaymentVerification"

import subscriptionsRoutes from "./routes/subscriptions"
import paymentRoutes from "./routes/payments"
import billingRouter from "./routes/billing"
import webhookRoutes from "./routes/webhook"
import paystackRoutes from "./routes/paystack"
import feePaymentsRoutes from "./routes/feePayments"

import adminRoutes from "./routes/admin"
import schoolOnboardingRoutes from "./routes/schoolOnboarding"

import { checkExpiredSubscriptions } from "./jobs/subscriptionExpiry"

dotenv.config()

const app = express()
const server = http.createServer(app)
const PORT = Number(process.env.PORT) || 5000

/* ==========================================
   CORS CONFIG
========================================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "https://edunerve-frontend.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

const isLocalhostOrigin = (origin: string) =>
  /^http:\/\/localhost:\d+$/.test(origin) ||
  /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  if (origin.endsWith(".vercel.app")) return true
  if (isLocalhostOrigin(origin)) return true
  return false
}

/* ==========================================
   SOCKET.IO
========================================== */
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin || undefined)) {
        return callback(null, true)
      }
      return callback(new Error("Not allowed by Socket CORS"))
    },
    credentials: true,
  },
})

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id)

  // General room join
  socket.on("join", (userId: number | string) => {
    if (!userId) return
    socket.join(String(userId))
    console.log(`👤 User joined room: ${userId}`)
  })

  // Dedicated per-user notification room
  socket.on("join-user-room", (userId: number | string) => {
    if (!userId) return
    socket.join(`user:${userId}`)
    console.log(`🔔 User joined notification room: user:${userId}`)
  })

  // School-level room
  socket.on("join-school-room", (schoolId: number | string) => {
    if (!schoolId) return
    socket.join(`school:${schoolId}`)
    console.log(`🏫 Joined school room: school:${schoolId}`)
  })

  socket.on("disconnect", (reason) => {
    console.log("❌ Socket disconnected:", socket.id, reason)
  })
})

/* ==========================================
   MIDDLEWARE
========================================== */
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin || undefined)) {
        return callback(null, true)
      }
      return callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
  })
)

/* ===== WEBHOOKS (BEFORE JSON) ===== */
app.use("/webhook", webhookRoutes)
app.use("/api/paystack/webhook", express.raw({ type: "application/json" }))

/* ===== BODY PARSERS ===== */
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

/* ===== STATIC FILES ===== */
app.use("/uploads", express.static(path.join(__dirname, "./uploads")))

/* ==========================================
   ROOT
========================================== */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("EduCore API is running 🚀")
})

/* ==========================================
   API ROUTES
========================================== */

/* AUTH & USERS */
app.use("/auth", authRouter)
app.use("/users", userRoutes)
app.use("/api/fees", feePaymentsRoutes)

/* CORE SCHOOL */
app.use("/schools", schoolsRouter)
app.use("/students", studentsRouter)
app.use("/teachers", teachersRouter)
app.use("/classes", classesRouter)
app.use("/subjects", subjectRoutes)

/* ACADEMICS */
app.use("/attendance", attendanceRouter)
app.use("/results", resultsRouter)
app.use("/report", reportRouter)

/* DASHBOARDS */
app.use("/dashboard", dashboardRouter)
app.use("/analytics", analyticsRoutes)
app.use("/teacher", teacherDashboardRoutes)
app.use("/parent-portal", parentPortalRoutes)

/* COMMUNICATION */
app.use("/notifications", notificationRoutes)
app.use("/messages", createMessageRoutes(io))

/* PARENT */
app.use("/parents", parentRoutes)

/* FEES & INVOICES */
app.use("/fees", feesRouter)
app.use("/invoices", invoiceRoutes)
app.use("/fee-invoices", feeInvoicesRouter)
app.use("/api/paystack", feePaymentVerificationRoutes)
app.use("/school-onboarding", schoolOnboardingRoutes)

/* PAYMENTS & BILLING */
app.use("/subscriptions", subscriptionsRoutes)
app.use("/payments", paymentRoutes)
app.use("/billing", billingRouter)
app.use("/api/paystack", paystackRoutes)

/* ADMIN */
app.use("/admin", adminRoutes)

/* ==========================================
   CRON JOBS
========================================== */
cron.schedule("0 0 * * *", async () => {
  console.log("⏰ Running subscription expiry check...")
  try {
    await checkExpiredSubscriptions()
  } catch (error) {
    console.error("Subscription expiry cron error:", error)
  }
})

/* ==========================================
   404 HANDLER
========================================== */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    message: "Route not found",
  })
})

/* ==========================================
   GLOBAL ERROR HANDLER
========================================== */
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("SERVER ERROR:", err)

    if (err.message === "Not allowed by CORS") {
      return res.status(403).json({
        message: "CORS error: origin not allowed",
        allowedOrigins,
      })
    }

    if (err.message === "Not allowed by Socket CORS") {
      return res.status(403).json({
        message: "Socket CORS error: origin not allowed",
        allowedOrigins,
      })
    }

    return res.status(500).json({
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development"
          ? err?.message || "Unknown error"
          : undefined,
    })
  }
)

/* ==========================================
   START SERVER
========================================== */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log("✅ Allowed origins:", allowedOrigins)
})