export type PlanKey = "NORMAL" | "PRO"

export const SUBSCRIPTION_PLANS: Record<
  PlanKey,
  {
    name: PlanKey
    amount: number
    durationInDays: number
    features: string[]
  }
> = {
  NORMAL: {
    name: "NORMAL",
    amount: 5000, // ₦5,000
    durationInDays: 30,
    features: [
      "Student management",
      "Class management",
      "Basic reports",
      "Parent portal access",
    ],
  },
  PRO: {
    name: "PRO",
    amount: 10000, // ₦10,000
    durationInDays: 30,
    features: [
      "Everything in Normal",
      "Advanced analytics",
      "Priority support",
      "Messaging and notifications",
      "Premium admin tools",
    ],
  },
}