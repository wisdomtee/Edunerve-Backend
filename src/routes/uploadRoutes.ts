import express from "express"
import prisma from "../prisma"
import { upload } from "../middleware/upload"

const router = express.Router()

router.post(
  "/student-passport/:id",
  upload.single("passport"),
  async (req, res) => {
    try {
      const studentId = Number(req.params.id)

      const file = req.file

      if (!file) {
        return res.status(400).json({
          message: "No file uploaded",
        })
      }

      const updatedStudent =
        await prisma.student.update({
          where: {
            id: studentId,
          },

          data: {
            passportUrl:
              file.filename,
          },
        })

      res.json(updatedStudent)
    } catch (err) {
      console.error(err)

      res.status(500).json({
        message: "Upload failed",
      })
    }
  }
)

export default router