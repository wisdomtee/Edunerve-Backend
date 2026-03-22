import { Router } from "express"
import  prisma  from "../prisma"

const router = Router()

router.post("/record", async (req, res) => {
  try {

    const { schoolId, amount, reference, status } = req.body

    const payment = await prisma.payment.create({
      data: {
        schoolId,
        amount,
        reference,
        status
      }
    })

    res.json(payment)

  } catch (error) {
    console.error(error)
    res.status(500).json({ error })
  }
})

export default router