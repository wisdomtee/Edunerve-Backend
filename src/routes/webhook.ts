import { Router } from "express"
import prisma from "../prisma"
import crypto from "crypto"
import { SUBSCRIPTION_PLANS, PlanKey } from "../config/subscriptionPlans"

const router = Router()

router.post("/paystack", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY || ""

    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex")

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).json({ message: "Invalid signature" })
    }

    const event = req.body

    if (event.event === "charge.success") {
      const data = event.data
      const reference = data.reference

      const payment = await prisma.payment.findUnique({
        where: { reference },
      })

      if (!payment || payment.status === "SUCCESS") {
        return res.sendStatus(200)
      }

      const planConfig = SUBSCRIPTION_PLANS[payment.plan as PlanKey]

      const now = new Date()
      const end = new Date()
      end.setDate(end.getDate() + planConfig.durationInDays)

      await prisma.$transaction([
        prisma.payment.update({
          where: { reference },
          data: {
            status: "SUCCESS",
            paidAt: new Date(),
          },
        }),
        prisma.school.update({
          where: { id: payment.schoolId },
          data: {
            subscriptionStatus: "active",
            subscriptionPlan: payment.plan,
            subscriptionStart: now,
            subscriptionEnd: end,
          },
        }),
      ])
    }

    return res.sendStatus(200)
  } catch (err) {
    console.error("Webhook error:", err)
    return res.sendStatus(500)
  }
})

export default router