import express from "express"

const router = express.Router()

let meetings: any[] = [] // replace with DB later

// GET all meetings
router.get("/", (req, res) => {
  res.json({ meetings })
})

// CREATE meeting
router.post("/create", (req, res) => {
  const { title, joinUrl } = req.body

  if (!title || !joinUrl) {
    return res.status(400).json({ message: "Title and joinUrl required" })
  }

  const newMeeting = {
    id: Date.now(),
    title,
    joinUrl,
  }

  meetings.push(newMeeting)

  return res.json({
    message: "Meeting created successfully",
    meeting: newMeeting,
  })
})

export default router