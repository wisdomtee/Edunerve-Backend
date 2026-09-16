import prisma from "../prisma";
import { PaystackAdapter } from "../payment/paystack.adapter";

const gateway = new PaystackAdapter();

export const createPaymentSession = async (schoolId: string, amount: number) => {
  const payment = await gateway.initializePayment({
    email: "billing@school.com",
    amount: amount * 100
  });

  await prisma.paymentTransaction.create({
    data: {
      schoolId,
      amount,
      currency: "NGN",
      reference: payment.data.reference,
      status: "PENDING",
      gateway: "PAYSTACK"
    }
  });

  return payment;
};