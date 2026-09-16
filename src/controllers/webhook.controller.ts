import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
export const paystackWebhook = async (req: any, res: any) => {
  const event = req.body;

  if (event.event === "charge.success") {
    const reference = event.data.reference;

    await prisma.paymentTransaction.update({
      where: { reference },
      data: { status: "SUCCESS" }
    });
  }

  res.sendStatus(200);
};