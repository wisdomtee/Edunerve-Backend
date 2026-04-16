import { Server } from "socket.io"
import http from "http"

export let io: Server | null = null

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        process.env.FRONTEND_URL || "http://localhost:3000",
      ],
      credentials: true,
    },
  })

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id)

    // General join by user id
    socket.on("join", (userId: number | string) => {
      if (!userId) return
      socket.join(String(userId))
      console.log(`👤 User joined room: ${userId}`)
    })

    // Dedicated notification room
    socket.on("join-user-room", (userId: number | string) => {
      if (!userId) return
      socket.join(`user:${userId}`)
      console.log(`🔔 User joined notification room: user:${userId}`)
    })

    // Optional school-wide room
    socket.on("join-school-room", (schoolId: number | string) => {
      if (!schoolId) return
      socket.join(`school:${schoolId}`)
      console.log(`🏫 User joined school room: school:${schoolId}`)
    })

    socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", socket.id, reason)
    })
  })

  return io
}