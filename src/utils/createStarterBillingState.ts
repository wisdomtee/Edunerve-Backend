import { PrismaClient, PlanType, BillingStatus } from "@prisma/client"

const prisma = new PrismaClient()

type CreateStarterBillingStateParams = {
  schoolId: number
  tx?: PrismaClient | any
}

export async function createStarterBillingState({
  schoolId,
  tx,
}: CreateStarterBillingStateParams) {
  const db = tx || prisma

  const now = new Date()
  const trialEndsAt = new Date(now)
  trialEndsAt.setDate(trialEndsAt.getDate() + 14) // 14-day starter trial

  return db.schoolBillingState.create({
    data: {
      schoolId,
      plan: PlanType.NORMAL,
      status: BillingStatus.TRIAL,
      amount: 0,
      currency: "NGN",
      billingCycle: "monthly",
      trialStartsAt: now,
      trialEndsAt,
      nextBillingDate: trialEndsAt,
      isAutoRenew: false,
      notes: "Starter billing state auto-created when school was created",
    },
  })
}