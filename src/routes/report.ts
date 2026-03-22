import { Router } from "express"
import PDFDocument from "pdfkit"
import prisma from "../prisma"
import { authMiddleware } from "../middleware/auth"

const router = Router()

router.get("/:studentId", authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.studentId as string

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        school: true,
        classItem: true,
        results: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    })

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    const results = student.results || []
    const total = results.reduce((sum, item) => sum + item.score, 0)
    const average = results.length ? total / results.length : 0

    let grade = "F"
    if (average >= 70) grade = "A"
    else if (average >= 60) grade = "B"
    else if (average >= 50) grade = "C"
    else if (average >= 45) grade = "D"

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${student.name.replace(/\s+/g, "_")}_report_card.pdf"`
    )

    const doc = new PDFDocument({ margin: 50 })
    doc.pipe(res)

    doc.fontSize(22).text(student.school?.name || "School Report Card", {
      align: "center",
    })

    doc.moveDown()
    doc.fontSize(18).text("Student Report Card", { align: "center" })

    doc.moveDown(2)
    doc.fontSize(12).text(`Student Name: ${student.name}`)
    doc.text(`Student ID: ${student.studentId}`)
    doc.text(`Class: ${student.classItem?.name || "-"}`)
    doc.text(`School: ${student.school?.name || "-"}`)

    doc.moveDown(2)
    doc.fontSize(14).text("Results", { underline: true })
    doc.moveDown()

    if (results.length === 0) {
      doc.fontSize(12).text("No results available.")
    } else {
      results.forEach((result, index) => {
        doc.fontSize(12).text(`${index + 1}. ${result.subject}: ${result.score}`)
      })
    }

    doc.moveDown(2)
    doc.fontSize(12).text(`Average Score: ${average.toFixed(2)}`)
    doc.text(`Grade: ${grade}`)

    doc.moveDown(3)
    doc.text("Principal Signature: ______________________")
    doc.moveDown(2)
    doc.text("Date: ______________________")

    doc.end()
  } catch (error) {
    console.error("GET /report/:studentId error:", error)
    return res.status(500).json({ message: "Failed to generate report card" })
  }
})

export default router