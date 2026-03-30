import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import http from "http"
import { Server } from "socket.io"

import authRouter from "./routes/auth"
import studentsRouter from "./routes/students"
import teachersRouter from "./routes/teachers"
import classesRouter from "./routes/classes"
import schoolsRouter from "./routes/schools"
import attendanceRouter from "./routes/attendance"
import dashboardRouter from "./routes/dashboard"
import resultsRouter from "./routes/results"
import reportRouter from "./routes/report"
import adminRoutes from "./routes/admin"
import subjectRoutes from "./routes/subject"
import analyticsRoutes from "./routes/analytics"
import notificationRoutes from "./routes/notifications"
import teacherDashboardRoutes from "./routes/teacherDashboard"
import parentPortalRoutes from "./routes/parentPortal"
import parentRoutes from "./routes/parent"
import feesRoutes from "./routes/fees"
import createMessageRoutes from "./routes/messages"
import userRoutes from "./routes/users"

dotenv.config()

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 5000

// ✅ UPDATED ORIGINS
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://edunarverontend-1.vercel.app", // ✅ your real frontend
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

// ✅ SOCKET.IO CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true)
      }

      return callback(new Error("Not allowed by Socket CORS"))
    },
    credentials: true,
  },
})

// ✅ EXPRESS CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)

      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true)
      }

      return callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

app.get("/", (_req, res) => {
  return res.status(200).send("EduCore API is running 🚀")
})

// ROUTES
app.use("/auth", authRouter)
app.use("/students", studentsRouter)
app.use("/teachers", teachersRouter)
app.use("/classes", classesRouter)
app.use("/schools", schoolsRouter)
app.use("/attendance", attendanceRouter)
app.use("/dashboard", dashboardRouter)
app.use("/results", resultsRouter)
app.use("/report", reportRouter)
app.use("/admin", adminRoutes)
app.use("/subjects", subjectRoutes)
app.use("/analytics", analyticsRoutes)
app.use("/notifications", notificationRoutes)
app.use("/teacher", teacherDashboardRoutes)
app.use("/parent-portal", parentPortalRoutes)
app.use("/parents", parentRoutes)
app.use("/fees", feesRoutes)
app.use("/messages", createMessageRoutes(io))
app.use("/users", userRoutes)

// ERROR HANDLER
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("SERVER ERROR:", err)

    if (err.message === "Not allowed by CORS") {
      return res.status(403).json({
        message: "CORS error: origin not allowed",
        allowedOrigins,
      })
    }

    return res.status(500).json({
      message: "Internal server error",
    })
  }
)

// START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log("Allowed origins:", allowedOrigins)
})