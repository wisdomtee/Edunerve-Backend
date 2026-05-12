import cron from "node-cron"
import prisma from "../prisma"

export const startExamAutoSubmit = () => {
  cron.schedule("* * * * *", async () => {
    console.log("⏱ Checking expired exams...")

    const now = new Date()

    const expiredAttempts = await prisma.examAttempt.findMany({
      where: {
        status: "ONGOING",
        exam: {
          endTime: {
            lt: now,
          },
        },
      },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
      },
    })

    for (const attempt of expiredAttempts) {
      let score = 0
      const total = attempt.exam.questions.length

      // auto mark (optional: blank answers = wrong)
      const percentage = (score / total) * 100

      await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "COMPLETED",
          submittedAt: now,
          score,
          total,
          percentage,
        },
      })

      console.log(`Auto-submitted attempt ${attempt.id}`)
    }
  })
}